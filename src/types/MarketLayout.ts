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