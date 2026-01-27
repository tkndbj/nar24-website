// models/coupon.ts - Matching Flutter implementation

import { Timestamp } from "firebase/firestore";

// ============================================================================
// ENUMS
// ============================================================================

export enum CouponStatus {
  Active = "active",
  Used = "used",
  Expired = "expired",
}

export enum BenefitType {
  FreeShipping = "free_shipping",
  // Add more benefit types as needed in the future
  // PercentageDiscount = "percentage_discount",
  // PrioritySupport = "priority_support",
}

export enum BenefitStatus {
  Active = "active",
  Used = "used",
  Expired = "expired",
}

// ============================================================================
// COUPON MODEL
// ============================================================================

export interface CouponData {
  userId: string;
  amount: number;
  currency: string;
  code?: string | null;
  description?: string | null;
  createdAt: Timestamp;
  createdBy: string;
  expiresAt?: Timestamp | null;
  usedAt?: Timestamp | null;
  orderId?: string | null;
  isUsed: boolean;
}

export class Coupon {
  readonly id: string;
  readonly userId: string;
  readonly amount: number;
  readonly currency: string;
  readonly code: string | null;
  readonly description: string | null;
  readonly createdAt: Timestamp;
  readonly createdBy: string;
  readonly expiresAt: Timestamp | null;
  readonly usedAt: Timestamp | null;
  readonly orderId: string | null;
  readonly isUsed: boolean;

  constructor(id: string, data: CouponData) {
    this.id = id;
    this.userId = data.userId ?? "";
    this.amount = data.amount ?? 0;
    this.currency = data.currency ?? "TL";
    this.code = data.code ?? null;
    this.description = data.description ?? null;
    this.createdAt = data.createdAt ?? Timestamp.now();
    this.createdBy = data.createdBy ?? "";
    this.expiresAt = data.expiresAt ?? null;
    this.usedAt = data.usedAt ?? null;
    this.orderId = data.orderId ?? null;
    this.isUsed = data.isUsed ?? false;
  }

  /**
   * Check if coupon is currently valid for use
   */
  get status(): CouponStatus {
    if (this.isUsed) return CouponStatus.Used;
    if (this.expiresAt && this.expiresAt.toDate() < new Date()) {
      return CouponStatus.Expired;
    }
    return CouponStatus.Active;
  }

  get isValid(): boolean {
    return this.status === CouponStatus.Active;
  }

  /**
   * Days until expiration (null if no expiration)
   */
  get daysUntilExpiry(): number | null {
    if (!this.expiresAt) return null;
    const now = new Date();
    const expiry = this.expiresAt.toDate();
    if (expiry < now) return 0;
    const diffTime = expiry.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Create from Firestore document
   */
  static fromFirestore(id: string, data: Record<string, unknown>): Coupon {
    return new Coupon(id, {
      userId: (data.userId as string) ?? "",
      amount: (data.amount as number) ?? 0,
      currency: (data.currency as string) ?? "TL",
      code: (data.code as string) ?? null,
      description: (data.description as string) ?? null,
      createdAt: (data.createdAt as Timestamp) ?? Timestamp.now(),
      createdBy: (data.createdBy as string) ?? "",
      expiresAt: (data.expiresAt as Timestamp) ?? null,
      usedAt: (data.usedAt as Timestamp) ?? null,
      orderId: (data.orderId as string) ?? null,
      isUsed: (data.isUsed as boolean) ?? false,
    });
  }

  /**
   * Convert to plain object for Firestore
   */
  toFirestore(): Record<string, unknown> {
    return {
      userId: this.userId,
      amount: this.amount,
      currency: this.currency,
      code: this.code,
      description: this.description,
      createdAt: this.createdAt,
      createdBy: this.createdBy,
      expiresAt: this.expiresAt,
      usedAt: this.usedAt,
      orderId: this.orderId,
      isUsed: this.isUsed,
    };
  }

  /**
   * Create a copy with updated fields
   */
  copyWith(updates: Partial<CouponData>): Coupon {
    return new Coupon(this.id, {
      userId: updates.userId ?? this.userId,
      amount: updates.amount ?? this.amount,
      currency: updates.currency ?? this.currency,
      code: updates.code !== undefined ? updates.code : this.code,
      description: updates.description !== undefined ? updates.description : this.description,
      createdAt: updates.createdAt ?? this.createdAt,
      createdBy: updates.createdBy ?? this.createdBy,
      expiresAt: updates.expiresAt !== undefined ? updates.expiresAt : this.expiresAt,
      usedAt: updates.usedAt !== undefined ? updates.usedAt : this.usedAt,
      orderId: updates.orderId !== undefined ? updates.orderId : this.orderId,
      isUsed: updates.isUsed ?? this.isUsed,
    });
  }

  toString(): string {
    return `Coupon(id: ${this.id}, amount: ${this.amount} ${this.currency}, isUsed: ${this.isUsed}, status: ${this.status})`;
  }
}

// ============================================================================
// USER BENEFIT MODEL
// ============================================================================

export interface UserBenefitData {
  userId: string;
  type: BenefitType;
  description?: string | null;
  createdAt: Timestamp;
  createdBy: string;
  expiresAt?: Timestamp | null;
  usedAt?: Timestamp | null;
  orderId?: string | null;
  isUsed: boolean;
  metadata?: Record<string, unknown> | null;
}

export class UserBenefit {
  readonly id: string;
  readonly userId: string;
  readonly type: BenefitType;
  readonly description: string | null;
  readonly createdAt: Timestamp;
  readonly createdBy: string;
  readonly expiresAt: Timestamp | null;
  readonly usedAt: Timestamp | null;
  readonly orderId: string | null;
  readonly isUsed: boolean;
  readonly metadata: Record<string, unknown> | null;

  constructor(id: string, data: UserBenefitData) {
    this.id = id;
    this.userId = data.userId ?? "";
    this.type = data.type ?? BenefitType.FreeShipping;
    this.description = data.description ?? null;
    this.createdAt = data.createdAt ?? Timestamp.now();
    this.createdBy = data.createdBy ?? "";
    this.expiresAt = data.expiresAt ?? null;
    this.usedAt = data.usedAt ?? null;
    this.orderId = data.orderId ?? null;
    this.isUsed = data.isUsed ?? false;
    this.metadata = data.metadata ?? null;
  }

  /**
   * Check if benefit is currently valid for use
   */
  get status(): BenefitStatus {
    if (this.isUsed) return BenefitStatus.Used;
    if (this.expiresAt && this.expiresAt.toDate() < new Date()) {
      return BenefitStatus.Expired;
    }
    return BenefitStatus.Active;
  }

  get isValid(): boolean {
    return this.status === BenefitStatus.Active;
  }

  /**
   * Days until expiration (null if no expiration)
   */
  get daysUntilExpiry(): number | null {
    if (!this.expiresAt) return null;
    const now = new Date();
    const expiry = this.expiresAt.toDate();
    if (expiry < now) return 0;
    const diffTime = expiry.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Human-readable type name
   */
  get typeName(): string {
    switch (this.type) {
      case BenefitType.FreeShipping:
        return "Free Shipping";
      default:
        return "Benefit";
    }
  }

  /**
   * Icon name for UI (Lucide icon names)
   */
  get iconName(): string {
    switch (this.type) {
      case BenefitType.FreeShipping:
        return "truck";
      default:
        return "gift";
    }
  }

  /**
   * Parse benefit type from string
   */
  static parseType(typeStr: string | null | undefined): BenefitType {
    switch (typeStr) {
      case "free_shipping":
        return BenefitType.FreeShipping;
      default:
        return BenefitType.FreeShipping;
    }
  }

  /**
   * Convert benefit type to string
   */
  static typeToString(type: BenefitType): string {
    switch (type) {
      case BenefitType.FreeShipping:
        return "free_shipping";
      default:
        return "free_shipping";
    }
  }

  /**
   * Create from Firestore document
   */
  static fromFirestore(id: string, data: Record<string, unknown>): UserBenefit {
    return new UserBenefit(id, {
      userId: (data.userId as string) ?? "",
      type: UserBenefit.parseType(data.type as string),
      description: (data.description as string) ?? null,
      createdAt: (data.createdAt as Timestamp) ?? Timestamp.now(),
      createdBy: (data.createdBy as string) ?? "",
      expiresAt: (data.expiresAt as Timestamp) ?? null,
      usedAt: (data.usedAt as Timestamp) ?? null,
      orderId: (data.orderId as string) ?? null,
      isUsed: (data.isUsed as boolean) ?? false,
      metadata: (data.metadata as Record<string, unknown>) ?? null,
    });
  }

  /**
   * Convert to plain object for Firestore
   */
  toFirestore(): Record<string, unknown> {
    return {
      userId: this.userId,
      type: UserBenefit.typeToString(this.type),
      description: this.description,
      createdAt: this.createdAt,
      createdBy: this.createdBy,
      expiresAt: this.expiresAt,
      usedAt: this.usedAt,
      orderId: this.orderId,
      isUsed: this.isUsed,
      metadata: this.metadata,
    };
  }

  /**
   * Create a copy with updated fields
   */
  copyWith(updates: Partial<UserBenefitData>): UserBenefit {
    return new UserBenefit(this.id, {
      userId: updates.userId ?? this.userId,
      type: updates.type ?? this.type,
      description: updates.description !== undefined ? updates.description : this.description,
      createdAt: updates.createdAt ?? this.createdAt,
      createdBy: updates.createdBy ?? this.createdBy,
      expiresAt: updates.expiresAt !== undefined ? updates.expiresAt : this.expiresAt,
      usedAt: updates.usedAt !== undefined ? updates.usedAt : this.usedAt,
      orderId: updates.orderId !== undefined ? updates.orderId : this.orderId,
      isUsed: updates.isUsed ?? this.isUsed,
      metadata: updates.metadata !== undefined ? updates.metadata : this.metadata,
    });
  }

  toString(): string {
    return `UserBenefit(id: ${this.id}, type: ${this.type}, isUsed: ${this.isUsed}, status: ${this.status})`;
  }
}

// ============================================================================
// CHECKOUT DISCOUNTS - Result of discount calculations
// ============================================================================

export interface CheckoutDiscounts {
  originalSubtotal: number;
  originalShipping: number;
  couponDiscount: number;
  shippingDiscount: number;
  finalSubtotal: number;
  finalShipping: number;
  finalTotal: number;
  appliedCoupon: Coupon | null;
  appliedFreeShipping: UserBenefit | null;
}

export const createCheckoutDiscounts = (params: {
  originalSubtotal: number;
  originalShipping: number;
  couponDiscount: number;
  shippingDiscount: number;
  appliedCoupon?: Coupon | null;
  appliedFreeShipping?: UserBenefit | null;
}): CheckoutDiscounts => {
  const finalSubtotal = params.originalSubtotal - params.couponDiscount;
  const finalShipping = params.originalShipping - params.shippingDiscount;

  return {
    originalSubtotal: params.originalSubtotal,
    originalShipping: params.originalShipping,
    couponDiscount: params.couponDiscount,
    shippingDiscount: params.shippingDiscount,
    finalSubtotal: Math.max(0, finalSubtotal),
    finalShipping: Math.max(0, finalShipping),
    finalTotal: Math.max(0, finalSubtotal) + Math.max(0, finalShipping),
    appliedCoupon: params.appliedCoupon ?? null,
    appliedFreeShipping: params.appliedFreeShipping ?? null,
  };
};

export const checkoutDiscountsHelpers = {
  hasCouponDiscount: (discounts: CheckoutDiscounts): boolean => discounts.couponDiscount > 0,
  hasFreeShipping: (discounts: CheckoutDiscounts): boolean => discounts.shippingDiscount > 0,
  hasAnyDiscount: (discounts: CheckoutDiscounts): boolean =>
    discounts.couponDiscount > 0 || discounts.shippingDiscount > 0,
  totalSavings: (discounts: CheckoutDiscounts): number =>
    discounts.couponDiscount + discounts.shippingDiscount,
};