// src/models/CategoryStructure.ts
//
// TypeScript mirror of `lib/models/category_structure.dart` from the Flutter
// app. Drives the dynamic category data that admins edit via nar24-admin-panel
// and that the Flutter mobile app, this website, and the admin panel all read
// from the same Firestore documents (`categories/meta`, `categories/structure`).
//
// Keep the shape in sync across all three clients.

export interface Labels {
  tr: string;
  en: string;
  ru: string;
}

// ─── Buyer tree ──────────────────────────────────────────────────────────────

export class BuyerSubSubcategory {
  constructor(
    public readonly key: string,
    public readonly labels: Partial<Labels>,
  ) {}

  static fromJson(json: unknown): BuyerSubSubcategory {
    // Support both legacy plain-string and current object form.
    if (typeof json === "string") {
      return new BuyerSubSubcategory(json, { tr: json, en: json, ru: json });
    }
    const map = (json ?? {}) as { key?: string; labels?: Partial<Labels> };
    return new BuyerSubSubcategory(map.key ?? "", map.labels ?? {});
  }

  getLabel(languageCode: string): string {
    return (
      this.labels[languageCode as keyof Labels] ?? this.labels.en ?? this.key
    );
  }
}

export class BuyerSubcategory {
  constructor(
    public readonly key: string,
    public readonly labels: Partial<Labels>,
    public readonly subSubcategories: BuyerSubSubcategory[],
  ) {}

  static fromJson(json: Record<string, unknown>): BuyerSubcategory {
    const subs = Array.isArray(json.subSubcategories) ? json.subSubcategories : [];
    return new BuyerSubcategory(
      (json.key as string) ?? "",
      (json.labels as Partial<Labels>) ?? {},
      subs.map((s) => BuyerSubSubcategory.fromJson(s)),
    );
  }

  getLabel(languageCode: string): string {
    return (
      this.labels[languageCode as keyof Labels] ?? this.labels.en ?? this.key
    );
  }
}

export class BuyerCategory {
  constructor(
    public readonly key: string,
    public readonly image: string,
    public readonly labels: Partial<Labels>,
    public readonly subcategories: BuyerSubcategory[],
  ) {}

  static fromJson(json: Record<string, unknown>): BuyerCategory {
    const subs = Array.isArray(json.subcategories) ? json.subcategories : [];
    return new BuyerCategory(
      (json.key as string) ?? "",
      (json.image as string) ?? "",
      (json.labels as Partial<Labels>) ?? {},
      subs.map((s) => BuyerSubcategory.fromJson(s as Record<string, unknown>)),
    );
  }

  getLabel(languageCode: string): string {
    return (
      this.labels[languageCode as keyof Labels] ?? this.labels.en ?? this.key
    );
  }
}

// ─── Product tree ────────────────────────────────────────────────────────────

export class ProductSubSubcategory {
  constructor(
    public readonly key: string,
    public readonly labels: Partial<Labels>,
  ) {}

  static fromJson(json: unknown): ProductSubSubcategory {
    if (typeof json === "string") {
      return new ProductSubSubcategory(json, { tr: json, en: json, ru: json });
    }
    const map = (json ?? {}) as { key?: string; labels?: Partial<Labels> };
    return new ProductSubSubcategory(map.key ?? "", map.labels ?? {});
  }

  getLabel(languageCode: string): string {
    return (
      this.labels[languageCode as keyof Labels] ?? this.labels.en ?? this.key
    );
  }
}

export class ProductSubcategory {
  constructor(
    public readonly key: string,
    public readonly labels: Partial<Labels>,
    public readonly subSubcategories: ProductSubSubcategory[],
  ) {}

  static fromJson(json: Record<string, unknown>): ProductSubcategory {
    const subs = Array.isArray(json.subSubcategories) ? json.subSubcategories : [];
    return new ProductSubcategory(
      (json.key as string) ?? "",
      (json.labels as Partial<Labels>) ?? {},
      subs.map((s) => ProductSubSubcategory.fromJson(s)),
    );
  }

  getLabel(languageCode: string): string {
    return (
      this.labels[languageCode as keyof Labels] ?? this.labels.en ?? this.key
    );
  }
}

export class ProductCategory {
  constructor(
    public readonly key: string,
    public readonly labels: Partial<Labels>,
    public readonly subcategories: ProductSubcategory[],
  ) {}

  static fromJson(json: Record<string, unknown>): ProductCategory {
    const subs = Array.isArray(json.subcategories) ? json.subcategories : [];
    return new ProductCategory(
      (json.key as string) ?? "",
      (json.labels as Partial<Labels>) ?? {},
      subs.map((s) => ProductSubcategory.fromJson(s as Record<string, unknown>)),
    );
  }

  getLabel(languageCode: string): string {
    return (
      this.labels[languageCode as keyof Labels] ?? this.labels.en ?? this.key
    );
  }
}

// ─── Top-level container ─────────────────────────────────────────────────────

export class CategoryStructure {
  constructor(
    public readonly buyerCategories: BuyerCategory[],
    public readonly productCategories: ProductCategory[],
    public readonly buyerToProductMapping: Record<string, Record<string, string>>,
  ) {}

  static fromJson(json: Record<string, unknown>): CategoryStructure {
    const buyer = Array.isArray(json.buyerCategories) ? json.buyerCategories : [];
    const product = Array.isArray(json.productCategories)
      ? json.productCategories
      : [];
    const mapping =
      (json.buyerToProductMapping as Record<
        string,
        Record<string, string>
      > | null) ?? {};
    return new CategoryStructure(
      buyer.map((c) => BuyerCategory.fromJson(c as Record<string, unknown>)),
      product.map((c) => ProductCategory.fromJson(c as Record<string, unknown>)),
      mapping,
    );
  }

  // ── Buyer helpers ──────────────────────────────────────────────────────

  findBuyerCategory(key: string): BuyerCategory | undefined {
    return this.buyerCategories.find((c) => c.key === key);
  }

  getSubcategories(buyerCategory: string): BuyerSubcategory[] {
    return this.findBuyerCategory(buyerCategory)?.subcategories ?? [];
  }

  findBuyerSubcategory(
    buyerCategory: string,
    subcategory: string,
  ): BuyerSubcategory | undefined {
    return this.getSubcategories(buyerCategory).find((s) => s.key === subcategory);
  }

  getSubSubcategories(
    buyerCategory: string,
    subcategory: string,
  ): BuyerSubSubcategory[] {
    return this.findBuyerSubcategory(buyerCategory, subcategory)?.subSubcategories ?? [];
  }

  findBuyerSubSubcategory(
    buyerCategory: string,
    subcategory: string,
    subSubcategory: string,
  ): BuyerSubSubcategory | undefined {
    return this.getSubSubcategories(buyerCategory, subcategory).find(
      (s) => s.key === subSubcategory,
    );
  }

  localizeBuyerCategory(key: string, langCode: string): string {
    return this.findBuyerCategory(key)?.getLabel(langCode) ?? key;
  }

  localizeBuyerSubcategory(
    buyerCategory: string,
    subcategory: string,
    langCode: string,
  ): string {
    return (
      this.findBuyerSubcategory(buyerCategory, subcategory)?.getLabel(langCode) ??
      subcategory
    );
  }

  localizeBuyerSubSubcategory(
    buyerCategory: string,
    subcategory: string,
    subSubcategory: string,
    langCode: string,
  ): string {
    return (
      this.findBuyerSubSubcategory(
        buyerCategory,
        subcategory,
        subSubcategory,
      )?.getLabel(langCode) ?? subSubcategory
    );
  }

  /**
   * Resolve a buyer-side selection (category + subcategory + sub-subcategory)
   * to the product tree coordinates used by Typesense/Firestore queries.
   *
   * Mirrors `CategoryStructure.getBuyerToProductMapping` in the Flutter app —
   * Women/Men buyer selections fold their sub-subcategory into the product
   * subcategory slot, every other buyer selection keeps its subcategory.
   */
  getBuyerToProductMapping(
    buyerCategory: string,
    buyerSubcategory?: string,
    buyerSubSubcategory?: string,
  ): {
    category?: string;
    subcategory?: string;
    subSubcategory?: string;
  } {
    const category =
      buyerSubcategory !== undefined
        ? this.buyerToProductMapping[buyerCategory]?.[buyerSubcategory]
        : undefined;

    const subcategory =
      buyerCategory === "Women" || buyerCategory === "Men"
        ? buyerSubSubcategory
        : buyerSubcategory;

    return { category, subcategory, subSubcategory: undefined };
  }

  // ── Product helpers ────────────────────────────────────────────────────

  findProductCategory(key: string): ProductCategory | undefined {
    return this.productCategories.find((c) => c.key === key);
  }

  getProductSubcategories(categoryKey: string): ProductSubcategory[] {
    return this.findProductCategory(categoryKey)?.subcategories ?? [];
  }

  findProductSubcategory(
    categoryKey: string,
    subcategoryKey: string,
  ): ProductSubcategory | undefined {
    return this.getProductSubcategories(categoryKey).find(
      (s) => s.key === subcategoryKey,
    );
  }

  getProductSubSubcategories(
    categoryKey: string,
    subcategoryKey: string,
  ): ProductSubSubcategory[] {
    return (
      this.findProductSubcategory(categoryKey, subcategoryKey)?.subSubcategories ??
      []
    );
  }

  findProductSubSubcategory(
    categoryKey: string,
    subcategoryKey: string,
    subSubcategoryKey: string,
  ): ProductSubSubcategory | undefined {
    return this.getProductSubSubcategories(categoryKey, subcategoryKey).find(
      (s) => s.key === subSubcategoryKey,
    );
  }

  localizeProductCategory(key: string, langCode: string): string {
    return this.findProductCategory(key)?.getLabel(langCode) ?? key;
  }

  localizeProductSubcategory(
    categoryKey: string,
    subcategoryKey: string,
    langCode: string,
  ): string {
    return (
      this.findProductSubcategory(categoryKey, subcategoryKey)?.getLabel(
        langCode,
      ) ?? subcategoryKey
    );
  }

  localizeProductSubSubcategory(
    categoryKey: string,
    subcategoryKey: string,
    subSubcategoryKey: string,
    langCode: string,
  ): string {
    return (
      this.findProductSubSubcategory(
        categoryKey,
        subcategoryKey,
        subSubcategoryKey,
      )?.getLabel(langCode) ?? subSubcategoryKey
    );
  }
}
