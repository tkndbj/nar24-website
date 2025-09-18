// src/components/productdetail/DynamicAttributesWidget.tsx

import React, { useCallback } from "react";
import { Package, Ruler, Palette, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";

interface Product {
  attributes: Record<string, unknown>;
}

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
  isDarkMode = false 
}) => (
  <div className={`group relative overflow-hidden rounded-xl p-4 border transition-all duration-200 hover:shadow-lg hover:scale-[1.02] ${
    isDarkMode 
      ? "bg-gradient-to-br from-gray-800 to-gray-850 border-gray-700 hover:border-orange-500" 
      : "bg-gradient-to-br from-white to-gray-50 border-gray-200 hover:border-orange-300"
  }`}>
    <div className="flex items-start gap-3">
      {icon && (
        <div className={`mt-1 p-2 rounded-lg transition-colors ${
          isDarkMode 
            ? "bg-orange-900/20 text-orange-400 group-hover:bg-orange-900/30" 
            : "bg-orange-100 text-orange-600 group-hover:bg-orange-200"
        }`}>
          {icon}
        </div>
      )}
      
      <div className="flex-1 min-w-0">
        <h4 className={`text-sm font-semibold mb-1 ${
          isDarkMode ? "text-gray-300" : "text-gray-700"
        }`}>
          {title}
        </h4>
        <p className={`text-base font-medium break-words ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}>
          {value}
        </p>
      </div>
    </div>

    {/* Subtle hover effect */}
    <div className={`absolute inset-0 bg-gradient-to-r from-orange-500/0 to-orange-500/0 group-hover:from-orange-500/5 group-hover:to-orange-500/10 transition-all duration-200 ${
      isDarkMode ? "opacity-50" : ""
    }`} />
  </div>
);

const LoadingSkeleton: React.FC<{ isDarkMode?: boolean }> = ({ 
  isDarkMode = false 
}) => (
  <div className="space-y-4">
    <div className={`w-40 h-6 rounded animate-pulse ${
      isDarkMode ? "bg-gray-700" : "bg-gray-200"
    }`} />

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={`h-20 rounded-xl animate-pulse ${
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
  localization,
}) => {
  // ✅ FIXED: Proper nested translation function that uses JSON files
  const t = useCallback((key: string) => {
    if (!localization) {
      return key;
    }

    try {
      // Try to get the nested DynamicAttributesWidget translation
      const translation = localization(`DynamicAttributesWidget.${key}`);
      
      // Check if we got a valid translation (not the same as the key we requested)
      if (translation && translation !== `DynamicAttributesWidget.${key}`) {
        return translation;
      }
      
      // If nested translation doesn't exist, try direct key
      const directTranslation = localization(key);
      if (directTranslation && directTranslation !== key) {
        return directTranslation;
      }
      
      // Return the key as fallback
      return key;
    } catch (error) {
      console.warn(`Translation error for key: ${key}`, error);
      return key;
    }
  }, [localization]);

  // Enhanced localization function with icons
  const localizeAttribute = useCallback((
    key: string,
    value: unknown
  ): { title: string; localizedValue: string; icon: React.ReactNode } => {
    const titleMappings: Record<string, { titleKey: string; icon: React.ReactNode }> = {
      color: { titleKey: "color", icon: <Palette className="w-4 h-4" /> },
      size: { titleKey: "size", icon: <Ruler className="w-4 h-4" /> },
      material: { titleKey: "material", icon: <Package className="w-4 h-4" /> },
      brand: { titleKey: "brand", icon: <Package className="w-4 h-4" /> },
      model: { titleKey: "model", icon: <Wrench className="w-4 h-4" /> },
      weight: { titleKey: "weight", icon: <Package className="w-4 h-4" /> },
      dimensions: { titleKey: "dimensions", icon: <Ruler className="w-4 h-4" /> },
      warranty: { titleKey: "warranty", icon: <Package className="w-4 h-4" /> },
      origin: { titleKey: "origin", icon: <Package className="w-4 h-4" /> },
      category: { titleKey: "category", icon: <Package className="w-4 h-4" /> },
      subcategory: { titleKey: "subcategory", icon: <Package className="w-4 h-4" /> },
      condition: { titleKey: "condition", icon: <Package className="w-4 h-4" /> },
      style: { titleKey: "style", icon: <Palette className="w-4 h-4" /> },
      type: { titleKey: "type", icon: <Package className="w-4 h-4" /> },
    };

    const mapping = titleMappings[key.toLowerCase()];
    const title = mapping ? t(mapping.titleKey) : key.charAt(0).toUpperCase() + key.slice(1);
    const icon = mapping ? mapping.icon : <Package className="w-4 h-4" />;

    let localizedValue = "";
    if (value === null || value === undefined) {
      localizedValue = "";
    } else if (typeof value === "boolean") {
      localizedValue = value ? t("yes") : t("no");
    } else if (typeof value === "number") {
      localizedValue = value.toString();
    } else if (Array.isArray(value)) {
      localizedValue = value.join(", ");
    } else {
      localizedValue = value.toString();
    }

    return { 
      title, 
      localizedValue, 
      icon 
    };
  }, [t]);

  if (isLoading || !product) {
    return (
      <div className={`rounded-2xl p-6 border ${
        isDarkMode 
          ? "bg-gray-800 border-gray-700" 
          : "bg-white border-gray-200"
      }`}>
        <LoadingSkeleton isDarkMode={isDarkMode} />
      </div>
    );
  }

  if (!product.attributes || Object.keys(product.attributes).length === 0) {
    return null;
  }

  // Filter and format attributes
  const formattedAttributes: Array<{ title: string; value: string; icon: React.ReactNode }> = [];

  Object.entries(product.attributes).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      try {
        const { title, localizedValue, icon } = localizeAttribute(key, value);
        if (localizedValue.trim()) {
          formattedAttributes.push({ title, value: localizedValue, icon });
        }
      } catch (error) {
        console.error("Error localizing attribute", key, error);
        formattedAttributes.push({
          title: key,
          value: value.toString(),
          icon: <Package className="w-4 h-4" />
        });
      }
    }
  });

  if (formattedAttributes.length === 0) {
    return null;
  }

  return (
    <div className={`rounded-2xl p-6 border shadow-sm ${
      isDarkMode 
        ? "bg-gray-800 border-gray-700" 
        : "bg-white border-gray-200"
    }`}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${
            isDarkMode 
              ? "bg-orange-900/20 text-orange-400" 
              : "bg-orange-100 text-orange-600"
          }`}>
            <Package className="w-5 h-5" />
          </div>
          <h3 className={`text-xl font-bold ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}>
            {t("title")}
          </h3>
        </div>

        {/* Attributes grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {formattedAttributes.map((attr, index) => (
            <AttributeCard 
              key={index} 
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