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
  bundleData?: Array<Record<string, unknown>>; // ✅ ADDED: Matches Flutter's List<Map<String, dynamic>>?
  maxQuantity?: number;
  discountThreshold?: number;
  bulkDiscountPercentage?: number; // ✅ ADDED: Was missing
  userId: string;
  rankingScore: number;
  promotionScore: number;
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
  sold: boolean;
  clickCount: number;
  clickCountAtStart: number;
  favoritesCount: number;
  cartCount: number;
  purchaseCount: number;
  deliveryOption: string;
  boostedImpressionCount: number;
  boostImpressionCountAtStart: number;
  isFeatured: boolean;
  isTrending: boolean;
  isBoosted: boolean;
  boostStartTime?: Date;
  boostEndTime?: Date;
  dailyClickCount: number;
  lastClickDate?: Date;
  paused: boolean;
  campaignName?: string;
  colorImages: Record<string, string[]>;
  videoUrl?: string;
  attributes: Record<string, unknown>;
  relatedProductIds: string[];
  relatedLastUpdated?: Date;
  relatedCount: number;
  // Add reference property for Firestore document reference
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
  // Safe parsing helpers - Matching Flutter implementation
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

  // ✅ ADDED: Safe bundle data parser matching Flutter's _safeBundleData
  static safeBundleData(value: unknown): Array<Record<string, unknown>> | undefined {
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

    // Handle Firestore Timestamp objects
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

    // Handle Firestore Timestamp objects
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

  static safeAttributes(value: unknown): Record<string, unknown> {
    if (value != null && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
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

  // Factory method to create Product from API response - Matching Flutter's fromJson
  static fromJson(json: ApiData): Product {
    const attributes = ProductUtils.safeAttributes(json.attributes);

    // Determine sourceCollection from reference path if available
    let sourceCollection: string | undefined;
    if (json.reference && typeof json.reference === "object") {
      const ref = json.reference as Record<string, unknown>;
      const path = String(ref.path || "");
      if (path.startsWith("products/")) {
        sourceCollection = "products";
      } else if (path.startsWith("shop_products/")) {
        sourceCollection = "shop_products";
      }
    }

    return {
      id: ProductUtils.safeString(json.id),
      sourceCollection,
      productName: ProductUtils.safeString(json.productName ?? json.title),
      description: ProductUtils.safeString(json.description),
      price: ProductUtils.safeDouble(json.price),
      currency: ProductUtils.safeString(json.currency, "TL"),
      condition: ProductUtils.safeString(json.condition, "Brand New"),
      brandModel: ProductUtils.safeStringNullable(
        json.brandModel ?? json.brand
      ),
      imageUrls: ProductUtils.safeStringArray(json.imageUrls),
      averageRating: ProductUtils.safeDouble(json.averageRating),
      reviewCount: ProductUtils.safeInt(json.reviewCount),
      gender: ProductUtils.safeStringNullable(json.gender),
      bundleIds: ProductUtils.safeStringArray(json.bundleIds),
      // ✅ FIXED: Use safeBundleData instead of simple undefined check
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
      userId: ProductUtils.safeString(json.userId),
      maxQuantity:
        json.maxQuantity != null
          ? ProductUtils.safeInt(json.maxQuantity)
          : undefined,
      discountThreshold:
        json.discountThreshold != null
          ? ProductUtils.safeInt(json.discountThreshold)
          : undefined,
      // ✅ ADDED: bulkDiscountPercentage (was missing)
      bulkDiscountPercentage:
        json.bulkDiscountPercentage != null
          ? ProductUtils.safeInt(json.bulkDiscountPercentage)
          : undefined,
      rankingScore: ProductUtils.safeDouble(json.rankingScore),
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
      // ✅ FIXED: relatedProductIds should default to empty array, not undefined
      relatedProductIds: ProductUtils.safeStringArray(json.relatedProductIds),
      relatedLastUpdated: ProductUtils.safeDateNullable(json.relatedLastUpdated),
      // ✅ FIXED: relatedCount should default to 0, not undefined
      relatedCount: ProductUtils.safeInt(json.relatedCount),
      bestSellerRank:
        json.bestSellerRank != null
          ? ProductUtils.safeInt(json.bestSellerRank)
          : undefined,
      sold: Boolean(json.sold),
      clickCount: ProductUtils.safeInt(json.clickCount),
      clickCountAtStart: ProductUtils.safeInt(json.clickCountAtStart),
      favoritesCount: ProductUtils.safeInt(json.favoritesCount),
      cartCount: ProductUtils.safeInt(json.cartCount),
      purchaseCount: ProductUtils.safeInt(json.purchaseCount),
      deliveryOption: ProductUtils.safeString(
        json.deliveryOption,
        "Self Delivery"
      ),
      boostedImpressionCount: ProductUtils.safeInt(json.boostedImpressionCount),
      boostImpressionCountAtStart: ProductUtils.safeInt(
        json.boostImpressionCountAtStart
      ),
      isFeatured: Boolean(json.isFeatured),
      isTrending: Boolean(json.isTrending),
      isBoosted: Boolean(json.isBoosted),
      boostStartTime: ProductUtils.safeDateNullable(json.boostStartTime),
      boostEndTime: ProductUtils.safeDateNullable(json.boostEndTime),
      dailyClickCount: ProductUtils.safeInt(json.dailyClickCount),
      lastClickDate: ProductUtils.safeDateNullable(json.lastClickDate),
      paused: Boolean(json.paused),
      campaignName: ProductUtils.safeStringNullable(json.campaignName),
      colorImages: ProductUtils.safeColorImages(json.colorImages),
      videoUrl: ProductUtils.safeStringNullable(json.videoUrl),
      attributes,
      reference: ProductUtils.safeReference(json.reference),
    };
  }

  // Convert Product to JSON for API calls - Matching Flutter's toJson
  static toJson(product: Product): Record<string, unknown> {
    const json: Record<string, unknown> = {
      id: product.id,
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
      // ✅ ADDED: bulkDiscountPercentage
      bulkDiscountPercentage: product.bulkDiscountPercentage,
      boostClickCountAtStart: product.boostClickCountAtStart,
      userId: product.userId,
      bundleIds: product.bundleIds,
      // ✅ ADDED: bundleData
      bundleData: product.bundleData,
      ownerId: product.ownerId,
      shopId: product.shopId,
      ilan_no: product.ilanNo,
      gender: product.gender,
      availableColors: product.availableColors,
      createdAt: product.createdAt.getTime(),
      sellerName: product.sellerName,
      category: product.category,
      subcategory: product.subcategory,
      subsubcategory: product.subsubcategory,
      quantity: product.quantity,
      bestSellerRank: product.bestSellerRank,
      sold: product.sold,
      clickCount: product.clickCount,
      clickCountAtStart: product.clickCountAtStart,
      favoritesCount: product.favoritesCount,
      cartCount: product.cartCount,
      purchaseCount: product.purchaseCount,
      deliveryOption: product.deliveryOption,
      boostedImpressionCount: product.boostedImpressionCount,
      boostImpressionCountAtStart: product.boostImpressionCountAtStart,
      isFeatured: product.isFeatured,
      isTrending: product.isTrending,
      isBoosted: product.isBoosted,
      boostStartTime: product.boostStartTime?.getTime(),
      boostEndTime: product.boostEndTime?.getTime(),
      dailyClickCount: product.dailyClickCount,
      lastClickDate: product.lastClickDate?.getTime(),
      paused: product.paused,
      promotionScore: product.promotionScore,
      rankingScore: product.rankingScore,
      campaign: product.campaign,
      campaignName: product.campaignName,
      colorImages: product.colorImages,
      videoUrl: product.videoUrl,
      attributes: product.attributes,
      reference: product.reference,
      relatedProductIds: product.relatedProductIds,
      relatedLastUpdated: product.relatedLastUpdated?.getTime(),
      relatedCount: product.relatedCount,
    };

    // Remove null/undefined values (matching Flutter's removeWhere)
    Object.keys(json).forEach((key) => {
      if (json[key] == null) {
        delete json[key];
      }
    });

    return json;
  }

  // Factory method for Algolia data - Matching Flutter's fromAlgolia
  static fromAlgolia(json: ApiData): Product {
    // Extract and normalize the ID
    let normalizedId = String(json.objectID ?? json.id ?? "");

    // Remove common Algolia prefixes (matching Flutter implementation)
    if (normalizedId.startsWith("products_")) {
      normalizedId = normalizedId.substring("products_".length);
    } else if (normalizedId.startsWith("shop_products_")) {
      normalizedId = normalizedId.substring("shop_products_".length);
    }

    const modifiedJson: ApiData = {
      ...json,
      id: normalizedId,
    };

    return ProductUtils.fromJson(modifiedJson);
  }

  // Create Product with copyWith functionality - Matching Flutter's copyWith
  static copyWith(
    product: Product,
    updates: Partial<Product> & {
      setOriginalPriceNull?: boolean;
      setDiscountPercentageNull?: boolean;
    }
  ): Product {
    const {
      setOriginalPriceNull = false,
      setDiscountPercentageNull = false,
      ...otherUpdates
    } = updates;

    return {
      ...product,
      ...otherUpdates,
      // Handle originalPrice with explicit null control
      originalPrice: setOriginalPriceNull
        ? undefined
        : otherUpdates.originalPrice ?? product.originalPrice,
      // Handle discountPercentage with explicit null control
      discountPercentage: setDiscountPercentageNull
        ? undefined
        : otherUpdates.discountPercentage ?? product.discountPercentage,
    };
  }

  // ✅ ADDED: toMap method for Firestore serialization (matching Flutter)
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
      rankingScore: product.rankingScore,
      promotionScore: product.promotionScore,
      campaign: product.campaign,
      ownerId: product.ownerId,
      shopId: product.shopId,
      ilan_no: product.ilanNo,
      gender: product.gender,
      createdAt: product.createdAt,
      sellerName: product.sellerName,
      category: product.category,
      subcategory: product.subcategory,
      subsubcategory: product.subsubcategory,
      quantity: product.quantity,
      bestSellerRank: product.bestSellerRank,
      sold: product.sold,
      clickCount: product.clickCount,
      clickCountAtStart: product.clickCountAtStart,
      favoritesCount: product.favoritesCount,
      cartCount: product.cartCount,
      purchaseCount: product.purchaseCount,
      deliveryOption: product.deliveryOption,
      boostedImpressionCount: product.boostedImpressionCount,
      boostImpressionCountAtStart: product.boostImpressionCountAtStart,
      isFeatured: product.isFeatured,
      isTrending: product.isTrending,
      isBoosted: product.isBoosted,
      boostStartTime: product.boostStartTime,
      boostEndTime: product.boostEndTime,
      dailyClickCount: product.dailyClickCount,
      lastClickDate: product.lastClickDate,
      paused: product.paused,
      campaignName: product.campaignName,
      colorImages: product.colorImages,
      videoUrl: product.videoUrl,
      relatedProductIds: product.relatedProductIds,
      relatedLastUpdated: product.relatedLastUpdated,
      relatedCount: product.relatedCount,
    };

    // Add attributes if not empty
    if (product.attributes && Object.keys(product.attributes).length > 0) {
      map.attributes = product.attributes;
    }

    // Remove null/undefined values
    Object.keys(map).forEach((key) => {
      if (map[key] == null) {
        delete map[key];
      }
    });

    return map;
  }
}