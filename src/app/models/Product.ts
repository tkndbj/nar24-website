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
  bundlePrice?: number;
  userId: string;
  discountThreshold?: number;
  rankingScore: number;
  promotionScore: number;
  campaign?: string;
  campaignDiscount?: number;
  campaignPrice?: number;
  ownerId: string;
  shopId?: string;
  ilanNo: string;
  searchIndex: string[];
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
  // Safe parsing helpers
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

  static safeDate(value: unknown): Date {
    if (value == null) return new Date();
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

  static safeReference(value: unknown): Product['reference'] {
    if (value != null && typeof value === "object" && !Array.isArray(value)) {
      const ref = value as Record<string, unknown>;
      if (ref.id && ref.path && ref.parent) {
        return {
          id: String(ref.id),
          path: String(ref.path),
          parent: {
            id: String((ref.parent as Record<string, unknown>)?.id || '')
          }
        };
      }
    }
    return undefined;
  }

  // Factory method to create Product from API response
  static fromJson(json: ApiData): Product {
    const attributes = ProductUtils.safeAttributes(json.attributes);

    // Determine sourceCollection from reference path if available
    let sourceCollection: string | undefined;
    if (json.reference && typeof json.reference === 'object') {
      const ref = json.reference as Record<string, unknown>;
      const path = String(ref.path || '');
      if (path.startsWith('products/')) {
        sourceCollection = 'products';
      } else if (path.startsWith('shop_products/')) {
        sourceCollection = 'shop_products';
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
      bundlePrice: json.bundlePrice != null
        ? ProductUtils.safeDouble(json.bundlePrice)
        : undefined,
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
      discountThreshold:
        json.discountThreshold != null
          ? ProductUtils.safeInt(json.discountThreshold)
          : undefined,
      rankingScore: ProductUtils.safeDouble(json.rankingScore),
      promotionScore: ProductUtils.safeDouble(json.promotionScore),
      campaign: ProductUtils.safeStringNullable(json.campaign),
      campaignDiscount:
        json.campaignDiscount != null
          ? ProductUtils.safeDouble(json.campaignDiscount)
          : undefined,
      campaignPrice:
        json.campaignPrice != null
          ? ProductUtils.safeDouble(json.campaignPrice)
          : undefined,
      ownerId: ProductUtils.safeString(json.ownerId),
      shopId: ProductUtils.safeStringNullable(json.shopId),
      ilanNo: ProductUtils.safeString(json.ilan_no ?? json.id, "N/A"),
      searchIndex: ProductUtils.safeStringArray(json.searchIndex),
      createdAt: ProductUtils.safeDate(json.createdAt),
      sellerName: ProductUtils.safeString(json.sellerName, "Unknown"),
      category: ProductUtils.safeString(json.category, "Uncategorized"),
      subcategory: ProductUtils.safeString(json.subcategory),
      subsubcategory: ProductUtils.safeString(json.subsubcategory),
      quantity: ProductUtils.safeInt(json.quantity),
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

  // Convert Product to JSON for API calls
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
      boostClickCountAtStart: product.boostClickCountAtStart,
      userId: product.userId,
      bundleIds: product.bundleIds,
      bundlePrice: product.bundlePrice,
      ownerId: product.ownerId,
      shopId: product.shopId,
      ilan_no: product.ilanNo,
      searchIndex: product.searchIndex,
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
      campaign: product.campaign,
      campaignDiscount: product.campaignDiscount,
      campaignPrice: product.campaignPrice,
      campaignName: product.campaignName,
      colorImages: product.colorImages,
      videoUrl: product.videoUrl,
      attributes: product.attributes,
      reference: product.reference,
    };

    // Remove null/undefined values
    Object.keys(json).forEach((key) => {
      if (json[key] == null) {
        delete json[key];
      }
    });

    return json;
  }

  // Factory method for Algolia data
  static fromAlgolia(json: ApiData): Product {
    // Algolia uses objectID instead of id
    // Extract and normalize the ID
    let normalizedId = String(json.objectID ?? json.id ?? '');

    // Remove common Algolia prefixes
    if (normalizedId.startsWith('products_')) {
      normalizedId = normalizedId.substring('products_'.length);
    } else if (normalizedId.startsWith('shop_products_')) {
      normalizedId = normalizedId.substring('shop_products_'.length);
    }

    const modifiedJson: ApiData = {
      ...json,
      id: normalizedId,
    };
    return ProductUtils.fromJson(modifiedJson);
  }

  // Create Product with copyWith functionality
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
        : (otherUpdates.originalPrice ?? product.originalPrice),
      // Handle discountPercentage with explicit null control  
      discountPercentage: setDiscountPercentageNull
        ? undefined
        : (otherUpdates.discountPercentage ?? product.discountPercentage),
    };
  }
}