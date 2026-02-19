// src/app/models/Product.ts

export interface Product {
  id: string;
  sourceCollection?: string;
  productName: string;
  description: string;
  price: number;
  currency: string;
  condition: string;
  brandModel?: string;
  imageUrls: string[];
  averageRating: number;
  reviewCount: number;
  originalPrice?: number;
  discountPercentage?: number;
  colorQuantities: Record<string, number>;
  boostClickCountAtStart: number;
  availableColors: string[];
  gender?: string;
  bundleIds: string[];
  bundleData?: Array<Record<string, unknown>>;
  maxQuantity?: number;
  discountThreshold?: number;
  bulkDiscountPercentage?: number;
  userId: string;
  promotionScore: number;
  needsUpdate?: boolean;
  archiveReason?: string;
  archivedByAdmin?: boolean;
  archivedByAdminAt?: Date;
  archivedByAdminId?: string;
  campaign?: string;
  ownerId: string;
  shopId?: string;
  ilanNo: string;
  createdAt: Date;
  sellerName: string;
  category: string;
  subcategory: string;
  subsubcategory: string;
  quantity: number;
  bestSellerRank?: number;
  clickCount: number;
  clickCountAtStart: number;
  favoritesCount: number;
  cartCount: number;
  purchaseCount: number;
  deliveryOption: string;
  boostedImpressionCount: number;
  boostImpressionCountAtStart: number;
  isFeatured: boolean;
  isBoosted: boolean;
  boostStartTime?: Date;
  boostEndTime?: Date;
  lastClickDate?: Date;
  paused: boolean;
  campaignName?: string;
  colorImages: Record<string, string[]>;
  videoUrl?: string;
  relatedProductIds: string[];
  relatedLastUpdated?: Date;
  relatedCount: number;

  // ── Classification ────────────────────────────────────────────────────────
  productType?: string;

  // ── Spec fields (top-level in Firestore, typed here) ──────────────────────
  // Mirrors Flutter's typed spec fields exactly for cross-platform consistency.
  // Read: top-level first, attributes sub-map fallback (legacy docs).
  // Write: always top-level. attributes map holds only truly misc fields.
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

  // ── Misc ──────────────────────────────────────────────────────────────────
  /** Truly miscellaneous fields with no dedicated property. Spec fields are NOT stored here. */
  attributes?: Record<string, unknown>;

  // Simplified Firestore document reference
  reference?: {
    id: string;
    path: string;
    parent: {
      id: string;
    };
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

// Type for raw API data
type ApiData = Record<string, unknown>;

// Utility class for Product operations
export class ProductUtils {
  // ═══════════════════════════════════════════════════════════════════════════
  // SAFE PARSING HELPERS — matching Flutter Parse helpers
  // ═══════════════════════════════════════════════════════════════════════════

  static safeDouble(value: unknown, defaultValue: number = 0): number {
    if (value == null) return defaultValue;
    if (typeof value === "number") return value;
    if (typeof value === "string") return parseFloat(value) || defaultValue;
    return defaultValue;
  }

  static safeInt(value: unknown, defaultValue: number = 0): number {
    if (value == null) return defaultValue;
    if (typeof value === "number") return Math.floor(value);
    if (typeof value === "string") return parseInt(value) || defaultValue;
    return defaultValue;
  }

  static safeString(value: unknown, defaultValue: string = ""): string {
    if (value == null) return defaultValue;
    return String(value);
  }

  static safeStringArray(value: unknown): string[] {
    if (value == null) return [];
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === "string") return value.length > 0 ? [value] : [];
    return [];
  }

  static safeColorQuantities(value: unknown): Record<string, number> {
    if (value == null || typeof value !== "object") return {};
    const result: Record<string, number> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
      result[String(key)] = ProductUtils.safeInt(val);
    });
    return result;
  }

  static safeColorImages(value: unknown): Record<string, string[]> {
    if (value == null || typeof value !== "object") return {};
    const result: Record<string, string[]> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
      if (Array.isArray(val)) {
        result[String(key)] = val.map(String);
      } else if (typeof val === "string" && val.length > 0) {
        result[String(key)] = [val];
      }
    });
    return result;
  }

  static safeBundleData(
    value: unknown,
  ): Array<Record<string, unknown>> | undefined {
    if (value == null) return undefined;
    if (!Array.isArray(value)) return undefined;
    try {
      return value.map((item) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          return item as Record<string, unknown>;
        }
        return {};
      });
    } catch (error) {
      console.error("Error parsing bundleData:", error);
      return undefined;
    }
  }

  static safeDate(value: unknown): Date {
    if (value == null) return new Date();
    if (
      typeof value === "object" &&
      value !== null &&
      "toDate" in value &&
      typeof (value as { toDate?: unknown }).toDate === "function"
    ) {
      return (value as { toDate: () => Date }).toDate();
    }
    if (value instanceof Date) return value;
    if (typeof value === "number") return new Date(value);
    if (typeof value === "string") {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? new Date() : parsed;
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
    ) {
      return (value as { toDate: () => Date }).toDate();
    }
    if (value instanceof Date) return value;
    if (typeof value === "number") return new Date(value);
    if (typeof value === "string") {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? undefined : parsed;
    }
    return undefined;
  }

  static safeStringNullable(value: unknown): string | undefined {
    if (value == null) return undefined;
    const str = String(value).trim();
    return str.length === 0 ? undefined : str;
  }

  static safeReference(value: unknown): Product["reference"] {
    if (value != null && typeof value === "object" && !Array.isArray(value)) {
      const ref = value as Record<string, unknown>;
      if (ref.id && ref.path && ref.parent) {
        return {
          id: String(ref.id),
          path: String(ref.path),
          parent: {
            id: String((ref.parent as Record<string, unknown>)?.id || ""),
          },
        };
      }
    }
    return undefined;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SPEC FIELD HELPERS — top-level first, attributes fallback (legacy docs)
  // Mirrors Flutter's _specList / _specStr / _specDouble helpers exactly.
  // ═══════════════════════════════════════════════════════════════════════════

  static specStringArray(
    json: ApiData,
    attrs: Record<string, unknown>,
    key: string,
  ): string[] | undefined {
    const raw = json[key] ?? attrs[key];
    if (raw == null) return undefined;
    if (Array.isArray(raw)) return raw.map(String);
    return undefined;
  }

  static specString(
    json: ApiData,
    attrs: Record<string, unknown>,
    key: string,
  ): string | undefined {
    const raw = json[key] ?? attrs[key];
    if (raw == null) return undefined;
    const str = String(raw).trim();
    return str.length > 0 ? str : undefined;
  }

  static specNumber(
    json: ApiData,
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
    reference: Product["reference"],
  ): string | undefined {
    if (!reference) return undefined;
    const path = reference.path || "";
    if (path.startsWith("products/")) return "products";
    if (path.startsWith("shop_products/")) return "shop_products";
    if (reference.parent?.id) return reference.parent.id;
    return undefined;
  }

  static sourceCollectionFromJson(json: ApiData): string | undefined {
    if (typeof json.sourceCollection === "string" && json.sourceCollection) {
      return json.sourceCollection;
    }
    if (json.reference && typeof json.reference === "object") {
      const ref = ProductUtils.safeReference(json.reference);
      return ProductUtils.sourceCollectionFromReference(ref);
    }
    return undefined;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FACTORIES — matching Flutter's fromJson / fromDocument / fromAlgolia
  // ═══════════════════════════════════════════════════════════════════════════

  static fromJson(json: ApiData): Product {
    // Raw attributes sub-map (legacy format)
    const rawAttrs =
      json.attributes != null &&
      typeof json.attributes === "object" &&
      !Array.isArray(json.attributes)
        ? (json.attributes as Record<string, unknown>)
        : {};

    // Strip spec keys + promoted keys from attributes so the map is truly misc.
    // Mirrors Flutter's cleanAttrs block in Product._fromMap.
    const cleanAttrs = { ...rawAttrs };
    const specKeys = [
      "gender",
      "productType",
      "clothingSizes",
      "clothingFit",
      "clothingTypes",
      "clothingType",
      "pantSizes",
      "pantFabricTypes",
      "pantFabricType",
      "footwearSizes",
      "jewelryMaterials",
      "consoleBrand",
      "curtainMaxWidth",
      "curtainMaxHeight",
    ];
    specKeys.forEach((k) => delete cleanAttrs[k]);

    return {
      id: ProductUtils.safeString(json.id),
      sourceCollection: ProductUtils.sourceCollectionFromJson(json),
      productName: ProductUtils.safeString(json.productName ?? json.title),
      description: ProductUtils.safeString(json.description),
      price: ProductUtils.safeDouble(json.price),
      currency: ProductUtils.safeString(json.currency, "TL"),
      condition: ProductUtils.safeString(json.condition, "Brand New"),
      brandModel: ProductUtils.safeStringNullable(
        json.brandModel ?? json.brand,
      ),
      imageUrls: ProductUtils.safeStringArray(json.imageUrls),
      averageRating: ProductUtils.safeDouble(json.averageRating),
      reviewCount: ProductUtils.safeInt(json.reviewCount),
      // gender: top-level first, attributes fallback
      gender:
        ProductUtils.safeStringNullable(json.gender) ??
        ProductUtils.safeStringNullable(rawAttrs.gender),
      bundleIds: ProductUtils.safeStringArray(json.bundleIds),
      bundleData: ProductUtils.safeBundleData(json.bundleData),
      originalPrice:
        json.originalPrice != null
          ? ProductUtils.safeDouble(json.originalPrice)
          : undefined,
      discountPercentage:
        json.discountPercentage != null
          ? ProductUtils.safeInt(json.discountPercentage)
          : undefined,
      colorQuantities: ProductUtils.safeColorQuantities(json.colorQuantities),
      boostClickCountAtStart: ProductUtils.safeInt(json.boostClickCountAtStart),
      availableColors: ProductUtils.safeStringArray(json.availableColors),
      needsUpdate: json.needsUpdate === true ? true : undefined,
      archiveReason: ProductUtils.safeStringNullable(json.archiveReason),
      archivedByAdmin: json.archivedByAdmin === true ? true : undefined,
      archivedByAdminAt: ProductUtils.safeDateNullable(json.archivedByAdminAt),
      archivedByAdminId: ProductUtils.safeStringNullable(
        json.archivedByAdminId,
      ),
      userId: ProductUtils.safeString(json.userId),
      maxQuantity:
        json.maxQuantity != null
          ? ProductUtils.safeInt(json.maxQuantity)
          : undefined,
      discountThreshold:
        json.discountThreshold != null
          ? ProductUtils.safeInt(json.discountThreshold)
          : undefined,
      bulkDiscountPercentage:
        json.bulkDiscountPercentage != null
          ? ProductUtils.safeInt(json.bulkDiscountPercentage)
          : undefined,
      promotionScore: ProductUtils.safeDouble(json.promotionScore),
      campaign: ProductUtils.safeStringNullable(json.campaign),
      ownerId: ProductUtils.safeString(json.ownerId),
      shopId: ProductUtils.safeStringNullable(json.shopId),
      ilanNo: ProductUtils.safeString(json.ilan_no ?? json.id, "N/A"),
      createdAt: ProductUtils.safeDate(json.createdAt),
      sellerName: ProductUtils.safeString(json.sellerName, "Unknown"),
      category: ProductUtils.safeString(json.category, "Uncategorized"),
      subcategory: ProductUtils.safeString(json.subcategory),
      subsubcategory: ProductUtils.safeString(json.subsubcategory),
      quantity: ProductUtils.safeInt(json.quantity),
      relatedProductIds: ProductUtils.safeStringArray(json.relatedProductIds),
      relatedLastUpdated: ProductUtils.safeDateNullable(
        json.relatedLastUpdated,
      ),
      relatedCount: ProductUtils.safeInt(json.relatedCount),
      bestSellerRank:
        json.bestSellerRank != null
          ? ProductUtils.safeInt(json.bestSellerRank)
          : undefined,
      clickCount: ProductUtils.safeInt(json.clickCount),
      clickCountAtStart: ProductUtils.safeInt(json.clickCountAtStart),
      favoritesCount: ProductUtils.safeInt(json.favoritesCount),
      cartCount: ProductUtils.safeInt(json.cartCount),
      purchaseCount: ProductUtils.safeInt(json.purchaseCount),
      deliveryOption: ProductUtils.safeString(
        json.deliveryOption,
        "Self Delivery",
      ),
      boostedImpressionCount: ProductUtils.safeInt(json.boostedImpressionCount),
      boostImpressionCountAtStart: ProductUtils.safeInt(
        json.boostImpressionCountAtStart,
      ),
      isFeatured: Boolean(json.isFeatured),
      isBoosted: Boolean(json.isBoosted),
      boostStartTime: ProductUtils.safeDateNullable(json.boostStartTime),
      boostEndTime: ProductUtils.safeDateNullable(json.boostEndTime),
      lastClickDate: ProductUtils.safeDateNullable(json.lastClickDate),
      paused: Boolean(json.paused),
      campaignName: ProductUtils.safeStringNullable(json.campaignName),
      colorImages: ProductUtils.safeColorImages(json.colorImages),
      videoUrl: ProductUtils.safeStringNullable(json.videoUrl),
      reference: ProductUtils.safeReference(json.reference),
      // ── Classification ────────────────────────────────────────────────────
      productType: ProductUtils.specString(json, rawAttrs, "productType"),
      // ── Spec fields — top-level first, attributes fallback ────────────────
      clothingSizes: ProductUtils.specStringArray(
        json,
        rawAttrs,
        "clothingSizes",
      ),
      clothingFit: ProductUtils.specString(json, rawAttrs, "clothingFit"),
      // clothingTypes: also promote legacy singular 'clothingType'
      clothingTypes:
        ProductUtils.specStringArray(json, rawAttrs, "clothingTypes") ??
        (ProductUtils.specString(json, rawAttrs, "clothingType") != null
          ? [ProductUtils.specString(json, rawAttrs, "clothingType")!]
          : undefined),
      pantSizes: ProductUtils.specStringArray(json, rawAttrs, "pantSizes"),
      // pantFabricTypes: also promote legacy singular 'pantFabricType'
      pantFabricTypes:
        ProductUtils.specStringArray(json, rawAttrs, "pantFabricTypes") ??
        (ProductUtils.specString(json, rawAttrs, "pantFabricType") != null
          ? [ProductUtils.specString(json, rawAttrs, "pantFabricType")!]
          : undefined),
      footwearSizes: ProductUtils.specStringArray(
        json,
        rawAttrs,
        "footwearSizes",
      ),
      jewelryMaterials: ProductUtils.specStringArray(
        json,
        rawAttrs,
        "jewelryMaterials",
      ),
      consoleBrand: ProductUtils.specString(json, rawAttrs, "consoleBrand"),
      curtainMaxWidth: ProductUtils.specNumber(
        json,
        rawAttrs,
        "curtainMaxWidth",
      ),
      curtainMaxHeight: ProductUtils.specNumber(
        json,
        rawAttrs,
        "curtainMaxHeight",
      ),
      // ── Misc ──────────────────────────────────────────────────────────────
      attributes: Object.keys(cleanAttrs).length > 0 ? cleanAttrs : undefined,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SERIALIZATION — matching Flutter's toJson / toMap
  // ═══════════════════════════════════════════════════════════════════════════

  static toJson(product: Product): Record<string, unknown> {
    const json: Record<string, unknown> = {
      id: product.id,
      sourceCollection: product.sourceCollection,
      productName: product.productName,
      description: product.description,
      price: product.price,
      currency: product.currency,
      condition: product.condition,
      brandModel: product.brandModel,
      imageUrls: product.imageUrls,
      averageRating: product.averageRating,
      reviewCount: product.reviewCount,
      originalPrice: product.originalPrice,
      discountPercentage: product.discountPercentage,
      discountThreshold: product.discountThreshold,
      maxQuantity: product.maxQuantity,
      bulkDiscountPercentage: product.bulkDiscountPercentage,
      boostClickCountAtStart: product.boostClickCountAtStart,
      userId: product.userId,
      ownerId: product.ownerId,
      shopId: product.shopId,
      ilan_no: product.ilanNo,
      gender: product.gender,
      availableColors: product.availableColors,
      needsUpdate: product.needsUpdate,
      archiveReason: product.archiveReason,
      archivedByAdmin: product.archivedByAdmin,
      archivedByAdminAt: product.archivedByAdminAt?.getTime(),
      archivedByAdminId: product.archivedByAdminId,
      createdAt: product.createdAt.getTime(),
      sellerName: product.sellerName,
      category: product.category,
      subcategory: product.subcategory,
      subsubcategory: product.subsubcategory,
      quantity: product.quantity,
      bestSellerRank: product.bestSellerRank,
      clickCount: product.clickCount,
      clickCountAtStart: product.clickCountAtStart,
      favoritesCount: product.favoritesCount,
      cartCount: product.cartCount,
      purchaseCount: product.purchaseCount,
      deliveryOption: product.deliveryOption,
      relatedProductIds: product.relatedProductIds,
      relatedLastUpdated: product.relatedLastUpdated?.getTime(),
      relatedCount: product.relatedCount,
      boostedImpressionCount: product.boostedImpressionCount,
      boostImpressionCountAtStart: product.boostImpressionCountAtStart,
      isFeatured: product.isFeatured,
      isBoosted: product.isBoosted,
      boostStartTime: product.boostStartTime?.getTime(),
      boostEndTime: product.boostEndTime?.getTime(),
      lastClickDate: product.lastClickDate?.getTime(),
      paused: product.paused,
      promotionScore: product.promotionScore,
      campaign: product.campaign,
      campaignName: product.campaignName,
      colorImages: product.colorImages,
      colorQuantities: product.colorQuantities,
      bundleIds: product.bundleIds,
      bundleData: product.bundleData,
      videoUrl: product.videoUrl,
      // ── Classification & spec fields — always top-level ───────────────────
      productType: product.productType,
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
      // ── Misc ──────────────────────────────────────────────────────────────
      attributes: product.attributes,
    };

    // Remove null/undefined values (matching Flutter's removeWhere)
    Object.keys(json).forEach((key) => {
      if (json[key] == null) delete json[key];
    });

    return json;
  }

  static fromAlgolia(json: ApiData): Product {
    let normalizedId = String(json.objectID ?? "");
    let sourceCollection: string | undefined;

    if (normalizedId.startsWith("products_")) {
      sourceCollection = "products";
      normalizedId = normalizedId.substring("products_".length);
    } else if (normalizedId.startsWith("shop_products_")) {
      sourceCollection = "shop_products";
      normalizedId = normalizedId.substring("shop_products_".length);
    } else {
      sourceCollection =
        json.shopId != null && String(json.shopId).length > 0
          ? "shop_products"
          : "products";
    }

    return ProductUtils.fromJson({
      ...json,
      id: normalizedId,
      sourceCollection,
    });
  }

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
      ...otherUpdates
    } = updates;

    return {
      ...product,
      ...otherUpdates,
      originalPrice: setOriginalPriceNull
        ? undefined
        : (otherUpdates.originalPrice ?? product.originalPrice),
      discountPercentage: setDiscountPercentageNull
        ? undefined
        : (otherUpdates.discountPercentage ?? product.discountPercentage),
    };
  }

  // toMap for Firestore serialization — matches Flutter's toMap
  static toMap(product: Product): Record<string, unknown> {
    const map: Record<string, unknown> = {
      productName: product.productName,
      description: product.description,
      price: product.price,
      currency: product.currency,
      condition: product.condition,
      brandModel: product.brandModel,
      imageUrls: product.imageUrls,
      averageRating: product.averageRating,
      reviewCount: product.reviewCount,
      originalPrice: product.originalPrice,
      discountPercentage: product.discountPercentage,
      colorQuantities: product.colorQuantities,
      bundleIds: product.bundleIds,
      bundleData: product.bundleData,
      maxQuantity: product.maxQuantity,
      boostClickCountAtStart: product.boostClickCountAtStart,
      availableColors: product.availableColors,
      userId: product.userId,
      discountThreshold: product.discountThreshold,
      bulkDiscountPercentage: product.bulkDiscountPercentage,
      promotionScore: product.promotionScore,
      campaign: product.campaign,
      ownerId: product.ownerId,
      shopId: product.shopId,
      ilan_no: product.ilanNo,
      gender: product.gender,
      needsUpdate: product.needsUpdate,
      archiveReason: product.archiveReason,
      archivedByAdmin: product.archivedByAdmin,
      archivedByAdminAt: product.archivedByAdminAt,
      archivedByAdminId: product.archivedByAdminId,
      createdAt: product.createdAt,
      sellerName: product.sellerName,
      category: product.category,
      subcategory: product.subcategory,
      subsubcategory: product.subsubcategory,
      quantity: product.quantity,
      bestSellerRank: product.bestSellerRank,
      clickCount: product.clickCount,
      clickCountAtStart: product.clickCountAtStart,
      favoritesCount: product.favoritesCount,
      cartCount: product.cartCount,
      purchaseCount: product.purchaseCount,
      deliveryOption: product.deliveryOption,
      boostedImpressionCount: product.boostedImpressionCount,
      boostImpressionCountAtStart: product.boostImpressionCountAtStart,
      isFeatured: product.isFeatured,
      isBoosted: product.isBoosted,
      boostStartTime: product.boostStartTime,
      boostEndTime: product.boostEndTime,
      lastClickDate: product.lastClickDate,
      paused: product.paused,
      campaignName: product.campaignName,
      colorImages: product.colorImages,
      videoUrl: product.videoUrl,
      relatedProductIds: product.relatedProductIds,
      relatedLastUpdated: product.relatedLastUpdated,
      relatedCount: product.relatedCount,
      // ── Classification & spec fields — always top-level ───────────────────
      productType: product.productType,
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
    };

    // Add attributes only if not empty (matches Flutter)
    if (product.attributes && Object.keys(product.attributes).length > 0) {
      map.attributes = product.attributes;
    }

    // Remove null/undefined values
    Object.keys(map).forEach((key) => {
      if (map[key] == null) delete map[key];
    });

    return map;
  }
}
