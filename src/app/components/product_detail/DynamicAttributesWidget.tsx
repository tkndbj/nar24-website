// src/components/productdetail/DynamicAttributesWidget.tsx

import React, { useMemo } from "react";
import { Package, Ruler, Palette, Wrench, Box, Shield, Globe, Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import { AttributeLocalizationUtils } from "@/constants/AttributeLocalization";

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
  <div className={`group relative overflow-hidden rounded-lg sm:rounded-lg p-2 sm:p-3 border transition-all duration-200 hover:shadow-md hover:scale-[1.01] ${
    isDarkMode 
      ? "bg-gradient-to-br from-gray-800 to-gray-850 border-gray-700 hover:border-orange-500" 
      : "bg-gradient-to-br from-white to-gray-50 border-gray-200 hover:border-orange-300"
  }`}>
    <div className="flex items-start gap-1.5 sm:gap-2">
      {icon && (
        <div className={`mt-0.5 p-1 sm:p-1.5 rounded transition-colors ${
          isDarkMode 
            ? "bg-orange-900/20 text-orange-400 group-hover:bg-orange-900/30" 
            : "bg-orange-100 text-orange-600 group-hover:bg-orange-200"
        }`}>
          {icon}
        </div>
      )}
      
      <div className="flex-1 min-w-0">
        <h4 className={`text-xs sm:text-xs font-medium mb-0.5 ${
          isDarkMode ? "text-gray-400" : "text-gray-600"
        }`}>
          {title}
        </h4>
        <p className={`text-xs sm:text-sm font-medium break-words leading-tight ${
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
  <div className="space-y-3">
    <div className={`w-24 sm:w-32 h-4 sm:h-5 rounded animate-pulse ${
      isDarkMode ? "bg-gray-700" : "bg-gray-200"
    }`} />

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
    if (lowerKey.includes('color') || lowerKey.includes('colour')) {
      return <Palette className={iconSize} />;
    }
    if (lowerKey.includes('size') || lowerKey.includes('dimension') || lowerKey.includes('footwear') || lowerKey.includes('pant')) {
      return <Ruler className={iconSize} />;
    }
    if (lowerKey.includes('material') || lowerKey.includes('type') || lowerKey.includes('clothing')) {
      return <Package className={iconSize} />;
    }
    if (lowerKey.includes('brand') || lowerKey.includes('console')) {
      return <Tag className={iconSize} />;
    }
    if (lowerKey.includes('model') || lowerKey.includes('component') || lowerKey.includes('variant')) {
      return <Wrench className={iconSize} />;
    }
    if (lowerKey.includes('weight')) {
      return <Box className={iconSize} />;
    }
    if (lowerKey.includes('warranty')) {
      return <Shield className={iconSize} />;
    }
    if (lowerKey.includes('origin') || lowerKey.includes('location')) {
      return <Globe className={iconSize} />;
    }
    if (lowerKey.includes('jewelry') || lowerKey.includes('jewellery')) {
      return <Palette className={iconSize} />;
    }
    if (lowerKey.includes('kitchen') || lowerKey.includes('appliance') || lowerKey.includes('white')) {
      return <Box className={iconSize} />;
    }
    
    // Default icon
    return <Package className={iconSize} />;
  };

  // Process and localize attributes
  const formattedAttributes = useMemo(() => {
    if (!product?.attributes || Object.keys(product.attributes).length === 0) {
      return [];
    }

    const attributes: Array<{ title: string; value: string; icon: React.ReactNode }> = [];

    Object.entries(product.attributes).forEach(([key, value]) => {
      // Skip empty values
      if (value === null || value === undefined || value === "") {
        return;
      }

      try {
        // Get localized title using AttributeLocalizationUtils
        const localizedTitle = AttributeLocalizationUtils.getLocalizedAttributeTitle(key, t);
        
        // Get localized value using AttributeLocalizationUtils
        const localizedValue = AttributeLocalizationUtils.getLocalizedAttributeValue(key, value, t);
        
        // Only add if we have a meaningful value
        if (localizedValue && localizedValue.trim()) {
          attributes.push({
            title: localizedTitle,
            value: localizedValue,
            icon: getAttributeIcon(key)
          });
        }
      } catch (error) {
        console.error("Error localizing attribute", key, error);
        // Fallback: use raw values with basic formatting
        const fallbackTitle = key
          .replace(/([A-Z])/g, ' $1')
          .trim()
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
        
        let fallbackValue = "";
        if (typeof value === "boolean") {
          fallbackValue = value ? (t("yes") || "Yes") : (t("no") || "No");
        } else if (Array.isArray(value)) {
          fallbackValue = value.join(", ");
        } else {
          fallbackValue = value.toString();
        }
        
        if (fallbackValue.trim()) {
          attributes.push({
            title: fallbackTitle,
            value: fallbackValue,
            icon: getAttributeIcon(key)
          });
        }
      }
    });

    return attributes;
  }, [product, t]);

  if (isLoading || !product) {
    return (
      <div className={`rounded-none sm:rounded-xl -mx-3 px-3 py-3 sm:mx-0 sm:p-5 border-0 sm:border ${
        isDarkMode 
          ? "bg-gray-800 sm:border-gray-700" 
          : "bg-white sm:border-gray-200"
      }`}>
        <LoadingSkeleton isDarkMode={isDarkMode} />
      </div>
    );
  }

  if (formattedAttributes.length === 0) {
    return null;
  }

  return (
    <div className={`rounded-none sm:rounded-xl px-0 py-3 sm:p-5 border-0 sm:border sm:shadow-sm ${
      isDarkMode 
        ? "bg-gray-800 sm:border-gray-700" 
        : "bg-white sm:border-gray-200"
    }`}>
      <div className="space-y-3 sm:space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className={`p-1 sm:p-1.5 rounded-lg ${
            isDarkMode 
              ? "bg-orange-900/20 text-orange-400" 
              : "bg-orange-100 text-orange-600"
          }`}>
            <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <h3 className={`text-base sm:text-lg font-bold ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}>
            {t("DynamicAttributesWidget.title") || t("productDetails") || "Product Details"}
          </h3>
        </div>

        {/* Attributes grid - more compact spacing on mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
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