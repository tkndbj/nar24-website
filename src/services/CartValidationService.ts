// services/CartValidationService.ts

import { getFunctions, httpsCallable } from 'firebase/functions';

interface CartItem {
  productId: string;
  quantity: number;
  cartData?: {
    selectedColor?: string;
    cachedPrice?: number;
    cachedBundlePrice?: number;
    cachedDiscountPercentage?: number;
    cachedDiscountThreshold?: number;
    cachedBulkDiscountPercentage?: number;
    cachedMaxQuantity?: number;
  };
}

interface ValidationError {
  key: string;
  params: Record<string, unknown>;
}

interface ValidatedItem {
  productId: string;
  unitPrice?: number;
  bundlePrice?: number;
  discountPercentage?: number;
  discountThreshold?: number;
  bulkDiscountPercentage?: number;
  maxQuantity?: number;
}

interface ValidationResponse {
  isValid: boolean;
  errors: Record<string, ValidationError>;
  warnings: Record<string, ValidationError>;
  validatedItems: ValidatedItem[];
}

interface CacheUpdateResponse {
  success: boolean;
  updated: number;
}

interface ItemToValidate {
  productId: string;
  quantity: number;
  selectedColor?: string;
  cachedPrice?: number;
  cachedBundlePrice?: number;
  cachedDiscountPercentage?: number;
  cachedDiscountThreshold?: number;
  cachedBulkDiscountPercentage?: number;
  cachedMaxQuantity?: number;
}

interface ProductUpdate {
  productId: string;
  updates: {
    cachedPrice?: number;
    cachedBundlePrice?: number;
    cachedDiscountPercentage?: number;
    cachedDiscountThreshold?: number;
    cachedBulkDiscountPercentage?: number;
    cachedMaxQuantity?: number;
    unitPrice?: number;
    bundlePrice?: number;
    discountPercentage?: number;
    discountThreshold?: number;
    bulkDiscountPercentage?: number;
    maxQuantity?: number;
  };
}

class CartValidationService {
  private static instance: CartValidationService;
  private functions = getFunctions(undefined, 'europe-west3');

  private constructor() {}

  static getInstance(): CartValidationService {
    if (!CartValidationService.instance) {
      CartValidationService.instance = new CartValidationService();
    }
    return CartValidationService.instance;
  }

  /**
   * Validate cart items before checkout
   */
  async validateCartCheckout(
    cartItems: CartItem[],
    reserveStock: boolean = false
  ): Promise<ValidationResponse> {
    try {
      console.log(`🔍 Validating ${cartItems.length} items via Cloud Function...`);

      // ✅ Prepare cart items for validation (include cached values)
      const itemsToValidate: ItemToValidate[] = cartItems.map((item) => {
        const cartData = item.cartData || {};

        // ✅ SIMPLE: Just extract from cartData (always has these fields)
        return {
          productId: item.productId,
          quantity: item.quantity ?? 1,
          selectedColor: cartData.selectedColor,

          // ✅ Extract cached values (null if not present)
          cachedPrice: cartData.cachedPrice,
          cachedBundlePrice: cartData.cachedBundlePrice,
          cachedDiscountPercentage: cartData.cachedDiscountPercentage,
          cachedDiscountThreshold: cartData.cachedDiscountThreshold,
          cachedBulkDiscountPercentage: cartData.cachedBulkDiscountPercentage,
          cachedMaxQuantity: cartData.cachedMaxQuantity,
        };
      });

      // Call Cloud Function
      const validateFunction = httpsCallable
        <{ cartItems: ItemToValidate[]; reserveStock: boolean },
        ValidationResponse
      >(this.functions, 'validateCartCheckout');

      const result = await validateFunction({
        cartItems: itemsToValidate,
        reserveStock,
      });

      const data = result.data;

      console.log(
        `✅ Validation completed: isValid=${data.isValid}, ` +
        `errors=${Object.keys(data.errors || {}).length}, ` +
        `warnings=${Object.keys(data.warnings || {}).length}`
      );

      return data;
    } catch (error: unknown) {
      const firebaseError = error as { code?: string; message?: string };
      console.error('❌ Validation function error:', firebaseError.code, firebaseError.message);

      // Handle rate limiting
      if (firebaseError.code === 'functions/resource-exhausted') {
        return {
          isValid: false,
          errors: {
            _system: {
              key: 'rate_limit_exceeded',
              params: {},
            },
          },
          warnings: {},
          validatedItems: [],
        };
      }

      throw error;
    }
  }

  /**
   * Update cart cache after validation (sync fresh data)
   */
  async updateCartCache(
    userId: string,
    validatedItems: ValidatedItem[]
  ): Promise<boolean> {
    try {
      console.log(`🔄 Updating cart cache for ${validatedItems.length} items...`);

      const updates: ProductUpdate[] = validatedItems.map((item) => {
        // ✅ FIX: Safe extraction with null handling
        const productId = item.productId?.toString();
        const unitPrice = item.unitPrice;
        const bundlePrice = item.bundlePrice; // ✅ This is the NEW bundle price
        const discountPercentage = item.discountPercentage;
        const discountThreshold = item.discountThreshold;
        const bulkDiscountPercentage = item.bulkDiscountPercentage;
        const maxQuantity = item.maxQuantity;

        return {
          productId,
          updates: {
            // ✅ Update cached values (for future validations)
            cachedPrice: unitPrice,
            cachedBundlePrice: bundlePrice, // ✅ NEW bundle price (if exists)
            cachedDiscountPercentage: discountPercentage,
            cachedDiscountThreshold: discountThreshold,
            cachedBulkDiscountPercentage: bulkDiscountPercentage,
            cachedMaxQuantity: maxQuantity,

            // ✅ Also update denormalized fields (for quick access)
            unitPrice,
            bundlePrice,
            discountPercentage,
            discountThreshold,
            bulkDiscountPercentage,
            maxQuantity,
          },
        };
      });

      const updateFunction = httpsCallable
        <{ productUpdates: ProductUpdate[] },
        CacheUpdateResponse
      >(this.functions, 'updateCartCache');

      const result = await updateFunction({
        productUpdates: updates,
      });

      const data = result.data;

      console.log(`✅ Cache updated: ${data.updated} items`);

      return data.success === true;
    } catch (error) {
      console.error('❌ Cache update error:', error);
      return false;
    }
  }
}

// Export singleton instance
export default CartValidationService.getInstance();