// src/components/productdetail/DynamicAttributesWidget.tsx

import React, { useMemo } from "react";
import {
  Package,
  Ruler,
  Palette,
  Wrench,
  Box,
  Shield,
  Globe,
  Tag,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { AttributeLocalizationUtils } from "@/constants/AttributeLocalization";
import { Product } from "@/app/models/Product";

interface DynamicAttributesWidgetProps {
  product: Product | null;
  isLoading?: boolean;
  isDarkMode?: boolean;
  localization?: ReturnType<typeof useTranslations>;
}

interface AttributeCardProps {
  title: string;
  value: string;
  icon?: React.ReactNode;
  isDarkMode?: boolean;
}

const AttributeCard: React.FC<AttributeCardProps> = ({
  title,
  value,
  icon,
  isDarkMode = false,
}) => (
  <div
    className={`group relative overflow-hidden rounded-md p-1.5 sm:p-2 border transition-all duration-200 ${
      isDarkMode
        ? "bg-gray-800 border-gray-700 hover:border-orange-500"
        : "bg-white border-gray-200 hover:border-orange-300"
    }`}
  >
    <div className="flex items-start gap-1 sm:gap-1.5">
      {icon && (
        <div
          className={`mt-0.5 p-0.5 sm:p-1 rounded transition-colors ${
            isDarkMode
              ? "bg-orange-900/20 text-orange-400"
              : "bg-orange-100 text-orange-600"
          }`}
        >
          {icon}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <h4
          className={`text-[10px] sm:text-xs font-medium mb-0.5 ${
            isDarkMode ? "text-gray-400" : "text-gray-600"
          }`}
        >
          {title}
        </h4>
        <p
          className={`text-xs sm:text-xs font-medium break-words leading-tight ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  </div>
);

const LoadingSkeleton: React.FC<{ isDarkMode?: boolean }> = ({
  isDarkMode = false,
}) => (
  <div className="space-y-3">
    <div
      className={`w-24 sm:w-32 h-4 sm:h-5 rounded animate-pulse ${
        isDarkMode ? "bg-gray-700" : "bg-gray-200"
      }`}
    />

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={`h-14 sm:h-16 rounded-lg animate-pulse ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`}
        />
      ))}
    </div>
  </div>
);

const DynamicAttributesWidget: React.FC<DynamicAttributesWidgetProps> = ({
  product,
  isLoading = false,
  isDarkMode = false,
}) => {
  const t = useTranslations();

  // Get icon for attribute key
  const getAttributeIcon = (key: string): React.ReactNode => {
    const iconSize = "w-3 h-3 sm:w-3.5 sm:h-3.5";
    const lowerKey = key.toLowerCase();

    // Map attribute keys to icons
    if (lowerKey.includes("color") || lowerKey.includes("colour")) {
      return <Palette className={iconSize} />;
    }
    if (
      lowerKey.includes("size") ||
      lowerKey.includes("dimension") ||
      lowerKey.includes("footwear") ||
      lowerKey.includes("pant")
    ) {
      return <Ruler className={iconSize} />;
    }
    if (
      lowerKey.includes("material") ||
      lowerKey.includes("type") ||
      lowerKey.includes("clothing")
    ) {
      return <Package className={iconSize} />;
    }
    if (lowerKey.includes("brand") || lowerKey.includes("console")) {
      return <Tag className={iconSize} />;
    }
    if (
      lowerKey.includes("model") ||
      lowerKey.includes("component") ||
      lowerKey.includes("variant")
    ) {
      return <Wrench className={iconSize} />;
    }
    if (lowerKey.includes("weight")) {
      return <Box className={iconSize} />;
    }
    if (lowerKey.includes("warranty")) {
      return <Shield className={iconSize} />;
    }
    if (lowerKey.includes("origin") || lowerKey.includes("location")) {
      return <Globe className={iconSize} />;
    }
    if (lowerKey.includes("jewelry") || lowerKey.includes("jewellery")) {
      return <Palette className={iconSize} />;
    }
    if (
      lowerKey.includes("kitchen") ||
      lowerKey.includes("appliance") ||
      lowerKey.includes("white")
    ) {
      return <Box className={iconSize} />;
    }

    // Default icon
    return <Package className={iconSize} />;
  };

  const buildDisplayAttributes = (
    product: Product,
  ): Record<string, unknown> => {
    const combined: Record<string, unknown> = {};

    if (product.gender) combined["gender"] = product.gender;
    if (product.productType) combined["productType"] = product.productType;
    if (product.clothingSizes?.length)
      combined["clothingSizes"] = product.clothingSizes;
    if (product.clothingFit) combined["clothingFit"] = product.clothingFit;
    if (product.clothingTypes?.length)
      combined["clothingTypes"] = product.clothingTypes;
    if (product.pantSizes?.length) combined["pantSizes"] = product.pantSizes;
    if (product.pantFabricTypes?.length)
      combined["pantFabricTypes"] = product.pantFabricTypes;
    if (product.footwearSizes?.length)
      combined["footwearSizes"] = product.footwearSizes;
    if (product.jewelryMaterials?.length)
      combined["jewelryMaterials"] = product.jewelryMaterials;
    if (product.consoleBrand) combined["consoleBrand"] = product.consoleBrand;
    if (product.curtainMaxWidth != null)
      combined["curtainMaxWidth"] = product.curtainMaxWidth;
    if (product.curtainMaxHeight != null)
      combined["curtainMaxHeight"] = product.curtainMaxHeight;

    // Backward compat for old products still using attributes map
    Object.entries(product.attributes || {}).forEach(([key, value]) => {
      if (!(key in combined)) combined[key] = value;
    });

    return combined;
  };

  // Process and localize attributes
  const formattedAttributes = useMemo(() => {
    const displayAttributes = buildDisplayAttributes(product as Product);
    if (Object.keys(displayAttributes).length === 0) return [];

    const attributes: Array<{
      title: string;
      value: string;
      icon: React.ReactNode;
    }> = [];

    Object.entries(displayAttributes).forEach(([key, value]) => {
      // Skip empty values
      if (value === null || value === undefined || value === "") {
        return;
      }

      try {
        // Get localized title using AttributeLocalizationUtils
        const localizedTitle =
          AttributeLocalizationUtils.getLocalizedAttributeTitle(key, t);

        // Get localized value using AttributeLocalizationUtils
        const localizedValue =
          AttributeLocalizationUtils.getLocalizedAttributeValue(key, value, t);

        // Only add if we have a meaningful value
        if (localizedValue && localizedValue.trim()) {
          attributes.push({
            title: localizedTitle,
            value: localizedValue,
            icon: getAttributeIcon(key),
          });
        }
      } catch (error) {
        console.error("Error localizing attribute", key, error);
        // Fallback: use raw values with basic formatting
        const fallbackTitle = key
          .replace(/([A-Z])/g, " $1")
          .trim()
          .split(" ")
          .map(
            (word) =>
              word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
          )
          .join(" ");

        let fallbackValue = "";
        if (typeof value === "boolean") {
          fallbackValue = value ? t("yes") || "Yes" : t("no") || "No";
        } else if (Array.isArray(value)) {
          fallbackValue = value.join(", ");
        } else {
          fallbackValue = value.toString();
        }

        if (fallbackValue.trim()) {
          attributes.push({
            title: fallbackTitle,
            value: fallbackValue,
            icon: getAttributeIcon(key),
          });
        }
      }
    });

    return attributes;
  }, [product, t]);

  if (isLoading || !product) {
    return (
      <div
        className={`rounded-lg p-2 sm:p-3 border ${
          isDarkMode
            ? "bg-gray-800 border-gray-700"
            : "bg-white border-gray-200"
        }`}
      >
        <LoadingSkeleton isDarkMode={isDarkMode} />
      </div>
    );
  }

  if (formattedAttributes.length === 0) {
    return null;
  }

  return (
    <div
      className={`rounded-lg p-2 sm:p-3 border ${
        isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
      }`}
    >
      <div className="space-y-2">
        {/* Header */}
        <div className="flex items-center gap-1.5">
          <div
            className={`p-0.5 sm:p-1 rounded ${
              isDarkMode
                ? "bg-orange-900/20 text-orange-400"
                : "bg-orange-100 text-orange-600"
            }`}
          >
            <Package className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </div>
          <h3
            className={`text-xs sm:text-sm font-bold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("DynamicAttributesWidget.title") ||
              t("productDetails") ||
              "Product Details"}
          </h3>
        </div>

        {/* Attributes grid - more compact spacing */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 sm:gap-2">
          {formattedAttributes.map((attr, index) => (
            <AttributeCard
              key={`${attr.title}-${index}`}
              title={attr.title}
              value={attr.value}
              icon={attr.icon}
              isDarkMode={isDarkMode}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default DynamicAttributesWidget;
