// src/types/product-detail.ts
// Shared types for product detail page and related components

import type { Product } from "@/app/models/Product";

export interface SellerInfo {
  sellerName: string;
  sellerAverageRating: number;
  shopAverageRating: number;
  sellerIsVerified: boolean;
  totalProductsSold: number;
  totalReviews: number;
  cargoAgreement?: Record<string, unknown> | null;
}

export interface Review {
  id: string;
  productId?: string;
  userId: string;
  userName?: string | null;
  userImage?: string | null;
  rating: number;
  review: string;
  imageUrls: string[];
  timestamp: string;
  likes: string[];
  helpful?: number;
  verified?: boolean;
  sellerResponse?: string | null;
  sellerResponseDate?: string | null;
}

export interface Question {
  id: string;
  questionText: string;
  answerText: string;
  timestamp: string;
  askerName: string;
  askerNameVisible: boolean;
  answered: boolean;
  productId: string;
}

export interface CollectionProduct {
  id: string;
  productName: string;
  price: number;
  currency: string;
  imageUrls: string[];
}

export interface CollectionData {
  id: string;
  name: string;
  imageUrl?: string;
  products: CollectionProduct[];
}

export interface RelatedProduct {
  id: string;
  productName: string;
  price: number;
  currency: string;
  imageUrls: string[];
  averageRating: number;
  discountPercentage?: number;
  brandModel?: string;
}

export interface BundleItem {
  productId: string;
  productName: string;
  originalPrice: number;
  bundlePrice: number;
  discountPercentage: number;
  imageUrl?: string;
  currency: string;
}

export interface BundleInfo {
  id: string;
  mainProductId: string;
  bundleItems: BundleItem[];
  isActive: boolean;
}

export interface BundleDisplayData {
  bundleId: string;
  product: Product;
  totalBundlePrice: number;
  totalOriginalPrice: number;
  discountPercentage: number;
  currency: string;
  totalProductCount: number;
}

export interface SalesConfig {
  salesPaused: boolean;
  pauseReason: string;
}

export interface ProductDetailData {
  product: Record<string, unknown>;
  seller: SellerInfo | null;
  reviews: Review[];
  reviewsTotal: number;
  questions: Question[];
  questionsTotal: number;
  relatedProducts: RelatedProduct[];
  collection: CollectionData | null;
  bundles: BundleInfo[];
  salesConfig: SalesConfig;
}
