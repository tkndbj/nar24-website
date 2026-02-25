/**
 * Market Layout Types
 * 
 * Shared types for the dynamic market layout system.
 * These types mirror the Flutter MarketWidgetConfig model.
 */

export type WidgetType =
  | "ads_banner"
  | "market_bubbles"
  | "thin_banner"
  | "preference_product"
  | "boosted_product_carousel"
  | "dynamic_product_list"
  | "market_banner"
  | "shop_horizontal_list";

export interface MarketWidgetConfig {
  id: string;
  name: string;
  type: WidgetType;
  isVisible: boolean;
  order: number;
}

export interface MarketLayoutState {
  widgets: MarketWidgetConfig[];
  visibleWidgets: MarketWidgetConfig[];
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
}

export interface MarketLayoutDocument {
  widgets: MarketWidgetConfig[];
  updatedAt?: unknown;
  updatedBy?: string;
  version?: number;
  resetReason?: string;
}

// Default widget configuration - matches Flutter's defaultWidgets
export const DEFAULT_WIDGETS: MarketWidgetConfig[] = [
  {
    id: "ads_banner",
    name: "Ads Banner",
    type: "ads_banner",
    isVisible: true,
    order: 0,
  },
  {
    id: "market_bubbles",
    name: "Market Bubbles",
    type: "market_bubbles",
    isVisible: true,
    order: 1,
  },
  {
    id: "thin_banner",
    name: "Thin Banner",
    type: "thin_banner",
    isVisible: true,
    order: 2,
  },
  {
    id: "preference_product",
    name: "Preference Products",
    type: "preference_product",
    isVisible: true,
    order: 3,
  },
  {
    id: "boosted_product_carousel",
    name: "Boosted Products",
    type: "boosted_product_carousel",
    isVisible: true,
    order: 4,
  },
  {
    id: "dynamic_product_list",
    name: "Dynamic Product Lists",
    type: "dynamic_product_list",
    isVisible: true,
    order: 5,
  },
  {
    id: "market_banner",
    name: "Market Banner",
    type: "market_banner",
    isVisible: true,
    order: 6,
  },
  {
    id: "shop_horizontal_list",
    name: "Shop Horizontal List",
    type: "shop_horizontal_list",
    isVisible: true,
    order: 7,
  },
];

// Valid widget types for validation
export const VALID_WIDGET_TYPES: readonly WidgetType[] = [
  "ads_banner",
  "market_bubbles",
  "thin_banner",
  "preference_product",
  "boosted_product_carousel",
  "dynamic_product_list",
  "market_banner",
  "shop_horizontal_list",
] as const;

// ============================================================================
// SERVER-SIDE PREFETCHED DATA TYPES
// ============================================================================

/** Serialized banner item for server-side prefetch (shared by all banner widgets) */
export interface PrefetchedBannerItem {
  id: string;
  imageUrl: string;
  dominantColor?: number;
  linkType?: string;
  linkedShopId?: string;
  linkedProductId?: string;
}

/** Serialized boosted product for server-side prefetch */
export interface PrefetchedBoostedProduct {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  currency: string;
  imageUrl: string;
  shopId: string;
  shopName?: string;
  isBoosted: true;
  boostExpiresAt?: number;
  category?: string;
  subcategory?: string;
  rating?: number;
  reviewCount?: number;
}

/** Serialized shop for server-side prefetch */
export interface PrefetchedShop {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  coverImageUrls?: string[];
  profileImageUrl?: string;
  averageRating: number;
  reviewCount: number;
  productCount: number;
  category?: string;
  isVerified: boolean;
  ownerId: string;
}

/** Serialized product for server-side prefetch (fields ProductCard needs) */
export interface PrefetchedProduct {
  id: string;
  productName: string;
  imageUrls: string[];
  price: number;
  currency: string;
  condition?: string;
  brandModel?: string;
  quantity?: number;
  colorQuantities?: Record<string, number>;
  colorImages?: Record<string, string[]>;
  averageRating?: number;
  discountPercentage?: number;
  deliveryOption?: string;
  campaignName?: string;
  isBoosted?: boolean;
  category?: string;
  subcategory?: string;
  subsubcategory?: string;
  gender?: string;
  shopId?: string;
  clothingSizes?: string[];
  pantSizes?: string[];
  footwearSizes?: string[];
  jewelryMaterials?: string[];
  attributes?: Record<string, unknown>;
}

/** Dynamic list config (serialized) */
export interface PrefetchedDynamicListConfig {
  id: string;
  title: string;
  isActive: boolean;
  order: number;
  gradientStart?: string;
  gradientEnd?: string;
  selectedProductIds?: string[];
  selectedShopId?: string;
  limit?: number;
  showViewAllButton?: boolean;
  prefetchedProducts?: PrefetchedProduct[];
}

/** Container for all prefetched widget data. null = prefetch failed, undefined = not attempted */
export interface PrefetchedWidgetData {
  ads_banner?: PrefetchedBannerItem[] | null;
  thin_banner?: PrefetchedBannerItem[] | null;
  market_banner?: PrefetchedBannerItem[] | null;
  boosted_product_carousel?: PrefetchedBoostedProduct[] | null;
  preference_product?: PrefetchedProduct[] | null;
  dynamic_product_list?: PrefetchedDynamicListConfig[] | null;
  shop_horizontal_list?: PrefetchedShop[] | null;
}