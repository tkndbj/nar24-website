// src/components/productdetail/DynamicAttributesWidget.tsx

import React from "react";
import { Package, Ruler, Palette, Wrench } from "lucide-react";

interface Product {
  attributes: Record<string, unknown>;
}

interface DynamicAttributesWidgetProps {
  product: Product | null;
  isLoading?: boolean;
  isDarkMode?: boolean;
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

// Enhanced localization function with icons
const localizeAttribute = (
  key: string,
  value: unknown
): { title: string; localizedValue: string; icon: React.ReactNode } => {
  const titleMappings: Record<string, { title: string; icon: React.ReactNode }> = {
    color: { title: "Color", icon: <Palette className="w-4 h-4" /> },
    size: { title: "Size", icon: <Ruler className="w-4 h-4" /> },
    material: { title: "Material", icon: <Package className="w-4 h-4" /> },
    brand: { title: "Brand", icon: <Package className="w-4 h-4" /> },
    model: { title: "Model", icon: <Wrench className="w-4 h-4" /> },
    weight: { title: "Weight", icon: <Package className="w-4 h-4" /> },
    dimensions: { title: "Dimensions", icon: <Ruler className="w-4 h-4" /> },
    warranty: { title: "Warranty", icon: <Package className="w-4 h-4" /> },
    origin: { title: "Origin", icon: <Package className="w-4 h-4" /> },
    category: { title: "Category", icon: <Package className="w-4 h-4" /> },
    subcategory: { title: "Subcategory", icon: <Package className="w-4 h-4" /> },
    condition: { title: "Condition", icon: <Package className="w-4 h-4" /> },
    style: { title: "Style", icon: <Palette className="w-4 h-4" /> },
    type: { title: "Type", icon: <Package className="w-4 h-4" /> },
  };

  const mapping = titleMappings[key.toLowerCase()] || {
    title: key.charAt(0).toUpperCase() + key.slice(1),
    icon: <Package className="w-4 h-4" />
  };

  let localizedValue = "";
  if (value === null || value === undefined) {
    localizedValue = "";
  } else if (typeof value === "boolean") {
    localizedValue = value ? "Yes" : "No";
  } else if (typeof value === "number") {
    localizedValue = value.toString();
  } else if (Array.isArray(value)) {
    localizedValue = value.join(", ");
  } else {
    localizedValue = value.toString();
  }

  return { 
    title: mapping.title, 
    localizedValue, 
    icon: mapping.icon 
  };
};

const DynamicAttributesWidget: React.FC<DynamicAttributesWidgetProps> = ({
  product,
  isLoading = false,
  isDarkMode = false,
}) => {
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
            Product Specifications
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