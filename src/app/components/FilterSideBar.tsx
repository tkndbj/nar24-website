"use client";

/**
 * FilterSidebar.tsx
 *
 * Reusable filter sidebar — full parity with Flutter's DynamicFilterScreen.
 *
 * Sections (same order as Flutter):
 *  1. Categories    — Women/Men only; shows subcategories or sub-subcategories
 *  2. Spec facets   — one collapsible section per Typesense facet field (dynamic)
 *  3. Brand         — searchable list
 *  4. Color         — swatch list
 *  5. Rating        — star chips (4+, 3+, 2+, 1+)
 *  6. Price range   — text inputs + quick-range chips
 *
 * Modes:
 *  Desktop — inline sticky column (no onClose prop)
 *  Mobile  — full-height portal drawer (pass isOpen + onClose)
 *
 * No `any` — Vercel-safe.
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import {
  X,
  ChevronDown,
  ChevronUp,
  Search,
  Star,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { AllInOneCategoryData } from "@/constants/productData";
import { globalBrands } from "@/constants/brands";

// ─────────────────────────────────────────────────────────────────────────────
// Public types (re-export so callers only import from this file)
// ─────────────────────────────────────────────────────────────────────────────

export interface FacetCount {
  value: string;
  count: number;
}

/** Mirrors Flutter's Map<String, List<Map<String,dynamic>>> specFacets */
export type SpecFacets = Record<string, FacetCount[]>;

/**
 * Canonical filter state shared by every page that uses FilterSidebar.
 * Mirrors the combined state across Flutter's DynamicFilterScreen +
 * ShopMarketProvider.
 */
export interface FilterState {
  /** Selected sub-subcategories (Women/Men category section) */
  subcategories: string[];
  colors: string[];
  brands: string[];
  /** Generic spec filters — field → selected values */
  specFilters: Record<string, string[]>;
  minPrice?: number;
  maxPrice?: number;
  /** Minimum star rating 1–4 */
  minRating?: number;
}

export const EMPTY_FILTER_STATE: FilterState = {
  subcategories: [],
  colors: [],
  brands: [],
  specFilters: {},
  minPrice: undefined,
  maxPrice: undefined,
  minRating: undefined,
};

/** Mirrors Flutter's activeFiltersCount getter */
export function getActiveFiltersCount(f: FilterState): number {
  let n = 0;
  n += f.subcategories.length;
  n += f.colors.length;
  n += f.brands.length;
  for (const vals of Object.values(f.specFilters)) n += vals.length;
  if (f.minPrice !== undefined || f.maxPrice !== undefined) n++;
  if (f.minRating !== undefined) n++;
  return n;
}

// ─────────────────────────────────────────────────────────────────────────────
// Static data
// ─────────────────────────────────────────────────────────────────────────────

const COLORS: { name: string; hex: string }[] = [
  { name: "Blue", hex: "#2196F3" },
  { name: "Orange", hex: "#FF9800" },
  { name: "Yellow", hex: "#FFEB3B" },
  { name: "Black", hex: "#111111" },
  { name: "Brown", hex: "#795548" },
  { name: "Dark Blue", hex: "#00008B" },
  { name: "Gray", hex: "#9E9E9E" },
  { name: "Pink", hex: "#E91E63" },
  { name: "Red", hex: "#F44336" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Green", hex: "#4CAF50" },
  { name: "Purple", hex: "#9C27B0" },
  { name: "Teal", hex: "#009688" },
  { name: "Lime", hex: "#CDDC39" },
  { name: "Cyan", hex: "#00BCD4" },
  { name: "Magenta", hex: "#FF00FF" },
  { name: "Indigo", hex: "#3F51B5" },
  { name: "Amber", hex: "#FFC107" },
  { name: "Deep Orange", hex: "#FF5722" },
  { name: "Light Blue", hex: "#03A9F4" },
  { name: "Deep Purple", hex: "#673AB7" },
  { name: "Light Green", hex: "#8BC34A" },
  { name: "Dark Gray", hex: "#444444" },
  { name: "Beige", hex: "#F5F5DC" },
  { name: "Turquoise", hex: "#40E0D0" },
  { name: "Violet", hex: "#EE82EE" },
  { name: "Olive", hex: "#808000" },
  { name: "Maroon", hex: "#800000" },
  { name: "Navy", hex: "#000080" },
  { name: "Silver", hex: "#C0C0C0" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface FilterSidebarProps {
  // Category context (determines which sections render)
  category: string;
  selectedSubcategory?: string;
  buyerCategory?: string;

  // Filter state
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;

  // Typesense spec facets (dynamic sections)
  specFacets?: SpecFacets;

  // Mobile drawer
  isOpen?: boolean;
  onClose?: () => void;

  isDarkMode?: boolean;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
  category,
  selectedSubcategory = "",
  buyerCategory = "",
  filters,
  onFiltersChange,
  specFacets = {},
  isOpen = false,
  onClose,
  isDarkMode = false,
  className = "",
}) => {
  const t = useTranslations();
  const isMobileDrawer = onClose !== undefined;

  // ── Expansion state ──────────────────────────────────────────────────────
  // Spec-facet sections are keyed by `spec_${fieldName}` and start expanded
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    categories: true,
    brand: false,
    color: false,
    rating: false,
    price: false,
  });
  const toggle = useCallback(
    (key: string) => setExpanded((p) => ({ ...p, [key]: !p[key] })),
    [],
  );

  // Auto-expand new spec-facet sections when they first arrive
  useEffect(() => {
    const next: Record<string, boolean> = {};
    let changed = false;
    for (const field of Object.keys(specFacets)) {
      const k = `spec_${field}`;
      if (!(k in expanded)) {
        next[k] = true;
        changed = true;
      }
    }
    if (changed) setExpanded((p) => ({ ...p, ...next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specFacets]);

  // ── Local UI state ───────────────────────────────────────────────────────
  const [brandSearch, setBrandSearch] = useState("");
  const [minPriceInput, setMinPriceInput] = useState(
    filters.minPrice?.toString() ?? "",
  );
  const [maxPriceInput, setMaxPriceInput] = useState(
    filters.maxPrice?.toString() ?? "",
  );

  // Sync price inputs when filters are cleared externally
  useEffect(() => {
    setMinPriceInput(filters.minPrice?.toString() ?? "");
    setMaxPriceInput(filters.maxPrice?.toString() ?? "");
  }, [filters.minPrice, filters.maxPrice]);

  // ── Touch-to-close ───────────────────────────────────────────────────────
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    if (touchStartX.current - e.changedTouches[0].clientX > 60) onClose?.();
    touchStartX.current = null;
  };

  // ── Category data (mirrors Flutter's _getAvailableSubSubcategories) ──────
  const shouldShowCategories =
    buyerCategory === "Women" || buyerCategory === "Men";

  const availableSubSubs: string[] = useMemo(() => {
    if (!shouldShowCategories) return [];

    // Normalise "clothing-fashion" → "Clothing & Fashion"
    const norm = category
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    if (!selectedSubcategory) {
      // No subcategory selected → show subcategories of the product category
      return AllInOneCategoryData.kSubcategories?.[norm] ?? [];
    }

    // Subcategory selected → show sub-subcategories
    return (
      AllInOneCategoryData.kSubSubcategories?.[norm]?.[selectedSubcategory] ??
      []
    );
  }, [shouldShowCategories, category, selectedSubcategory]);

  // ── Localization helpers ─────────────────────────────────────────────────
  const loc = (key: string, fallback: string) => {
    try {
      return t(key) || fallback;
    } catch {
      return fallback;
    }
  };

  const localizeColor = (name: string) =>
    loc(`DynamicMarket.color${name.replace(/\s+/g, "")}`, name);

  /** Mirrors Flutter's AttributeLocalizationUtils.getLocalizedAttributeTitle */
  const localizeField = (field: string) => {
    try {
      return t(`Attributes.${field}`);
    } catch {
      /* noop */
    }
    // Fallback: camelCase → Title Case
    return field
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (s) => s.toUpperCase());
  };

  /** Mirrors Flutter's AttributeLocalizationUtils.getLocalizedSingleValue */
  const localizeValue = (field: string, value: string) => {
    try {
      return t(`AttributeValues.${field}.${value}`);
    } catch {
      /* noop */
    }
    return value;
  };

  // ── Mutations ────────────────────────────────────────────────────────────

  const setList = <K extends "subcategories" | "colors" | "brands">(
    key: K,
    value: string,
  ) => {
    const list = filters[key] as string[];
    onFiltersChange({
      ...filters,
      [key]: list.includes(value)
        ? list.filter((i) => i !== value)
        : [...list, value],
    });
  };

  const setSpecValue = (field: string, value: string) => {
    const cur = filters.specFilters[field] ?? [];
    const next = cur.includes(value)
      ? cur.filter((v) => v !== value)
      : [...cur, value];
    const sf = { ...filters.specFilters };
    if (next.length === 0) delete sf[field];
    else sf[field] = next;
    onFiltersChange({ ...filters, specFilters: sf });
  };

  const clearSpec = (field: string) => {
    const sf = { ...filters.specFilters };
    delete sf[field];
    onFiltersChange({ ...filters, specFilters: sf });
  };

  const applyPrice = () => {
    const min = minPriceInput !== "" ? parseFloat(minPriceInput) : undefined;
    const max = maxPriceInput !== "" ? parseFloat(maxPriceInput) : undefined;
    if (min !== undefined && max !== undefined && min > max) {
      alert(
        loc(
          "DynamicMarket.priceRangeError",
          "Min price cannot exceed max price",
        ),
      );
      return;
    }
    onFiltersChange({ ...filters, minPrice: min, maxPrice: max });
  };

  const setQuickPrice = (min: number, max: number | undefined) => {
    setMinPriceInput(min.toString());
    setMaxPriceInput(max?.toString() ?? "");
    onFiltersChange({ ...filters, minPrice: min, maxPrice: max });
  };

  const clearAll = () => {
    onFiltersChange(EMPTY_FILTER_STATE);
    setBrandSearch("");
    setMinPriceInput("");
    setMaxPriceInput("");
  };

  const activeCount = getActiveFiltersCount(filters);

  // ── Sub-components ───────────────────────────────────────────────────────

  const dk = isDarkMode;

  const Divider = () => (
    <div className={`h-px ${dk ? "bg-white/[0.06]" : "bg-gray-100"} my-0.5`} />
  );

  const Badge: React.FC<{ count: number | boolean }> = ({ count }) => {
    if (!count) return null;
    return (
      <span className="ml-1.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center bg-orange-500 text-white text-[10px] font-bold rounded-full leading-none">
        {typeof count === "boolean" ? "✓" : count}
      </span>
    );
  };

  const SectionHeader: React.FC<{
    sectionKey: string;
    label: string;
    badge?: number | boolean;
  }> = ({ sectionKey, label, badge }) => (
    <button
      onClick={() => toggle(sectionKey)}
      className={`w-full flex items-center justify-between py-2.5 px-3 text-left transition-colors rounded-md ${
        dk ? "hover:bg-white/5" : "hover:bg-gray-50"
      }`}
    >
      <span
        className={`text-[11px] font-semibold tracking-widest uppercase ${
          dk ? "text-gray-300" : "text-gray-500"
        }`}
      >
        {label}
        <Badge count={badge ?? 0} />
      </span>
      {expanded[sectionKey] ? (
        <ChevronUp size={13} className="text-orange-400 flex-shrink-0" />
      ) : (
        <ChevronDown size={13} className="text-orange-400 flex-shrink-0" />
      )}
    </button>
  );

  const ClearBtn: React.FC<{ label: string; onClick: () => void }> = ({
    label,
    onClick,
  }) => (
    <button
      onClick={onClick}
      className="w-full text-left text-[11px] text-orange-400 hover:text-orange-500 italic px-3 pb-1 transition-colors"
    >
      {label}
    </button>
  );

  const CheckRow: React.FC<{
    label: string;
    checked: boolean;
    onChange: () => void;
    swatch?: string;
  }> = ({ label, checked, onChange, swatch }) => (
    <label className="flex items-center gap-2 px-3 py-[3px] cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="w-[13px] h-[13px] rounded border-gray-300 text-orange-500 focus:ring-orange-400 focus:ring-1 flex-shrink-0 cursor-pointer"
      />
      {swatch && (
        <span
          className="w-3 h-3 rounded-full border flex-shrink-0"
          style={{
            backgroundColor: swatch,
            borderColor: swatch === "#FFFFFF" ? "#d1d5db" : "transparent",
          }}
        />
      )}
      <span
        className={`text-[12px] leading-snug group-hover:text-orange-400 transition-colors truncate ${
          dk ? "text-gray-300" : "text-gray-600"
        }`}
      >
        {label}
      </span>
    </label>
  );

  // ── Body ──────────────────────────────────────────────────────────────────

  const body = (
    <div
      className={`flex flex-col h-full overflow-hidden ${
        dk ? "bg-gray-900" : "bg-white"
      }`}
      onTouchStart={isMobileDrawer ? onTouchStart : undefined}
      onTouchEnd={isMobileDrawer ? onTouchEnd : undefined}
    >
      {/* ── Sidebar header ── */}
      <div
        className={`flex-shrink-0 flex items-center justify-between px-3 py-3 border-b ${
          dk ? "border-white/[0.07]" : "border-gray-100"
        }`}
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-orange-400" />
          <span
            className={`text-sm font-bold ${dk ? "text-white" : "text-gray-900"}`}
          >
            {loc("DynamicMarket.filters", "Filters")}
          </span>
          {activeCount > 0 && <Badge count={activeCount} />}
        </div>
        <div className="flex items-center gap-3">
          {activeCount > 0 && (
            <button
              onClick={clearAll}
              className="text-[11px] text-orange-400 hover:text-orange-500 transition-colors font-medium"
            >
              {loc("DynamicMarket.clearAllFilters", "Clear all")}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className={`p-1.5 rounded-full transition-colors ${
                dk
                  ? "hover:bg-white/10 text-gray-400"
                  : "hover:bg-gray-100 text-gray-500"
              }`}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* ── Scrollable sections ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-10 pt-1 space-y-0">
        {/* ═══ 1. CATEGORIES (Women / Men only) ═══════════════════════════ */}
        {shouldShowCategories && availableSubSubs.length > 0 && (
          <>
            <SectionHeader
              sectionKey="categories"
              label={loc("DynamicMarket.categories", "Categories")}
              badge={filters.subcategories.length}
            />
            {expanded.categories && (
              <div className="pb-2">
                {filters.subcategories.length > 0 && (
                  <ClearBtn
                    label={loc(
                      "DynamicMarket.clearAllCategories",
                      "Clear categories",
                    )}
                    onClick={() =>
                      onFiltersChange({ ...filters, subcategories: [] })
                    }
                  />
                )}
                <div className="max-h-44 overflow-y-auto">
                  {availableSubSubs.map((sub) => (
                    <CheckRow
                      key={sub}
                      label={sub}
                      checked={filters.subcategories.includes(sub)}
                      onChange={() => setList("subcategories", sub)}
                    />
                  ))}
                </div>
              </div>
            )}
            <Divider />
          </>
        )}

        {/* ═══ 2. SPEC FACETS (Typesense-driven, one section per field) ═══ */}
        {Object.entries(specFacets).map(([field, facetValues]) => {
          if (!facetValues.length) return null;
          const sectionKey = `spec_${field}`;
          const selected = filters.specFilters[field] ?? [];
          const title = localizeField(field);

          return (
            <React.Fragment key={field}>
              <SectionHeader
                sectionKey={sectionKey}
                label={title}
                badge={selected.length}
              />
              {expanded[sectionKey] && (
                <div className="pb-2">
                  {selected.length > 0 && (
                    <ClearBtn
                      label={loc("DynamicMarket.clearAll", "Clear")}
                      onClick={() => clearSpec(field)}
                    />
                  )}
                  <div
                    className={`${
                      facetValues.length > 8 ? "max-h-48 overflow-y-auto" : ""
                    }`}
                  >
                    {facetValues.map(({ value, count }) => (
                      <CheckRow
                        key={value}
                        label={`${localizeValue(field, value)} (${count})`}
                        checked={selected.includes(value)}
                        onChange={() => setSpecValue(field, value)}
                      />
                    ))}
                  </div>
                </div>
              )}
              <Divider />
            </React.Fragment>
          );
        })}

        {/* ═══ 3. BRAND ════════════════════════════════════════════════════ */}
        <SectionHeader
          sectionKey="brand"
          label={loc("DynamicMarket.brands", "Brand")}
          badge={filters.brands.length}
        />
        {expanded.brand && (
          <div className="pb-2">
            {filters.brands.length > 0 && (
              <ClearBtn
                label={loc("DynamicMarket.clearAllBrands", "Clear brands")}
                onClick={() => onFiltersChange({ ...filters, brands: [] })}
              />
            )}
            {/* Search */}
            <div className="relative mx-3 mb-2">
              <Search
                size={11}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="text"
                value={brandSearch}
                onChange={(e) => setBrandSearch(e.target.value)}
                placeholder={loc(
                  "DynamicMarket.searchBrands",
                  "Search brands…",
                )}
                className={`w-full pl-7 pr-2 py-1.5 text-[12px] rounded-md border outline-none transition-colors ${
                  dk
                    ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-orange-400"
                    : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-400"
                }`}
              />
            </div>
            <div className="max-h-44 overflow-y-auto">
              {(globalBrands as string[])
                .filter((b) =>
                  b.toLowerCase().includes(brandSearch.toLowerCase()),
                )
                .map((brand) => (
                  <CheckRow
                    key={brand}
                    label={brand}
                    checked={filters.brands.includes(brand)}
                    onChange={() => setList("brands", brand)}
                  />
                ))}
            </div>
          </div>
        )}
        <Divider />

        {/* ═══ 4. COLOR ════════════════════════════════════════════════════ */}
        <SectionHeader
          sectionKey="color"
          label={loc("DynamicMarket.colors", "Color")}
          badge={filters.colors.length}
        />
        {expanded.color && (
          <div className="pb-2">
            {filters.colors.length > 0 && (
              <ClearBtn
                label={loc("DynamicMarket.clearAllColors", "Clear colors")}
                onClick={() => onFiltersChange({ ...filters, colors: [] })}
              />
            )}
            <div className="max-h-44 overflow-y-auto">
              {COLORS.map(({ name, hex }) => (
                <CheckRow
                  key={name}
                  label={localizeColor(name)}
                  swatch={hex}
                  checked={filters.colors.includes(name)}
                  onChange={() => setList("colors", name)}
                />
              ))}
            </div>
          </div>
        )}
        <Divider />

        {/* ═══ 5. RATING ═══════════════════════════════════════════════════ */}
        <SectionHeader
          sectionKey="rating"
          label={loc("DynamicMarket.rating", "Rating")}
          badge={filters.minRating !== undefined}
        />
        {expanded.rating && (
          <div className="px-3 pb-3 pt-1 space-y-2">
            {/* Active label */}
            {filters.minRating !== undefined && (
              <div
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-md ${
                  dk ? "bg-orange-900/30" : "bg-orange-50"
                }`}
              >
                <div className="flex items-center gap-1">
                  {Array.from({ length: filters.minRating }).map((_, i) => (
                    <Star
                      key={i}
                      size={12}
                      className="text-orange-400 fill-orange-400"
                    />
                  ))}
                  <span className="text-[11px] text-orange-400 ml-1 font-medium">
                    & up
                  </span>
                </div>
                <button
                  onClick={() =>
                    onFiltersChange({ ...filters, minRating: undefined })
                  }
                  className="text-orange-400 hover:text-orange-500"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            {/* Star chips */}
            <div className="flex flex-wrap gap-1.5">
              {([4, 3, 2, 1] as const).map((stars) => {
                const sel = filters.minRating === stars;
                return (
                  <button
                    key={stars}
                    onClick={() =>
                      onFiltersChange({
                        ...filters,
                        minRating: sel ? undefined : stars,
                      })
                    }
                    className={`flex items-center gap-0.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                      sel
                        ? "bg-orange-500 border-orange-500 text-white shadow-sm"
                        : dk
                          ? "bg-gray-800 border-gray-700 text-gray-300 hover:border-orange-400"
                          : "bg-white border-gray-200 text-gray-600 hover:border-orange-400"
                    }`}
                  >
                    {Array.from({ length: stars }).map((_, i) => (
                      <Star
                        key={i}
                        size={10}
                        className={
                          sel
                            ? "fill-white text-white"
                            : "fill-amber-400 text-amber-400"
                        }
                      />
                    ))}
                    <span className="ml-0.5">& up</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <Divider />

        {/* ═══ 6. PRICE RANGE ══════════════════════════════════════════════ */}
        <SectionHeader
          sectionKey="price"
          label={loc("DynamicMarket.priceRange", "Price Range")}
          badge={
            filters.minPrice !== undefined || filters.maxPrice !== undefined
          }
        />
        {expanded.price && (
          <div className="px-3 pb-3 pt-1 space-y-2">
            {/* Active price display */}
            {(filters.minPrice !== undefined ||
              filters.maxPrice !== undefined) && (
              <div
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-md ${
                  dk ? "bg-orange-900/30" : "bg-orange-50"
                }`}
              >
                <span className="text-[11px] text-orange-400 font-medium">
                  {filters.minPrice ?? 0} –{" "}
                  {filters.maxPrice !== undefined ? filters.maxPrice : "∞"}{" "}
                  {loc("DynamicMarket.currency", "TL")}
                </span>
                <button
                  onClick={() => {
                    onFiltersChange({
                      ...filters,
                      minPrice: undefined,
                      maxPrice: undefined,
                    });
                    setMinPriceInput("");
                    setMaxPriceInput("");
                  }}
                  className="text-orange-400 hover:text-orange-500"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            {/* Inputs */}
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder={loc("DynamicMarket.min", "Min")}
                value={minPriceInput}
                onChange={(e) => setMinPriceInput(e.target.value)}
                className={`w-full px-2 py-1.5 text-[12px] rounded-md border outline-none transition-colors ${
                  dk
                    ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-orange-400"
                    : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-400"
                }`}
              />
              <span
                className={`text-xs flex-shrink-0 ${dk ? "text-gray-600" : "text-gray-300"}`}
              >
                —
              </span>
              <input
                type="number"
                placeholder={loc("DynamicMarket.max", "Max")}
                value={maxPriceInput}
                onChange={(e) => setMaxPriceInput(e.target.value)}
                className={`w-full px-2 py-1.5 text-[12px] rounded-md border outline-none transition-colors ${
                  dk
                    ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-orange-400"
                    : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-400"
                }`}
              />
            </div>
            <button
              onClick={applyPrice}
              className="w-full py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-semibold rounded-md transition-colors"
            >
              {loc("DynamicMarket.applyPriceFilter", "Apply")}
            </button>
            {/* Quick ranges */}
            <p
              className={`text-[10px] uppercase tracking-wider ${dk ? "text-gray-600" : "text-gray-400"}`}
            >
              {loc("DynamicMarket.quickRanges", "Quick ranges")}
            </p>
            <div className="grid grid-cols-2 gap-1">
              {(
                [
                  { label: "0–100", min: 0, max: 100 },
                  { label: "100–500", min: 100, max: 500 },
                  { label: "500–1K", min: 500, max: 1000 },
                  { label: "1K+", min: 1000, max: undefined },
                ] as const
              ).map(({ label, min, max }) => {
                const sel =
                  filters.minPrice === min && filters.maxPrice === max;
                return (
                  <button
                    key={label}
                    onClick={() => setQuickPrice(min, max)}
                    className={`px-2 py-1 text-[11px] rounded transition-colors ${
                      sel
                        ? "bg-orange-500 text-white"
                        : dk
                          ? "bg-gray-800 text-gray-400 hover:bg-gray-700"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {label} {loc("DynamicMarket.currency", "TL")}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── Mobile portal ─────────────────────────────────────────────────────────

  if (isMobileDrawer) {
    if (!isOpen || typeof document === "undefined") return null;
    return createPortal(
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 z-[10000]"
          onClick={onClose}
        />
        {/* Drawer */}
        <div
          className={`fixed top-0 left-0 h-[100dvh] w-64 z-[10001] shadow-2xl overflow-hidden ${
            dk ? "bg-gray-900" : "bg-white"
          }`}
        >
          {body}
        </div>
      </>,
      document.body,
    );
  }

  // ── Desktop inline ────────────────────────────────────────────────────────

  return (
    <aside
      className={`sticky top-0 h-screen overflow-hidden flex flex-col border-r ${
        dk ? "bg-gray-900 border-white/[0.07]" : "bg-white border-gray-100"
      } ${className}`}
    >
      {body}
    </aside>
  );
};

export default FilterSidebar;
