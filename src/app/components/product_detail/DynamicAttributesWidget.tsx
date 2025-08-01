// src/components/productdetail/DynamicAttributesWidget.tsx

import React from "react";

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
  isDarkMode?: boolean;
}

const AttributeCard: React.FC<AttributeCardProps> = ({ 
  title, 
  value, 
  isDarkMode = false 
}) => (
  <div className={`inline-flex flex-col px-3 py-2 rounded-lg border ${
    isDarkMode 
      ? "bg-gray-900 border-orange-500" 
      : "bg-gray-50 border-orange-400"
  }`}>
    <span className={`text-xs font-semibold mb-1 truncate ${
      isDarkMode ? "text-gray-400" : "text-gray-600"
    }`}>
      {title}
    </span>
    <span className={`text-sm font-medium ${
      isDarkMode ? "text-white" : "text-gray-900"
    }`}>
      {value}
    </span>
  </div>
);

const LoadingSkeleton: React.FC<{ isDarkMode?: boolean }> = ({ 
  isDarkMode = false 
}) => (
  <div className={`w-full shadow-sm border-b ${
    isDarkMode 
      ? "bg-gray-800 border-gray-700" 
      : "bg-white border-gray-100"
  }`}>
    <div className="p-4 space-y-4">
      {/* Header skeleton */}
      <div className={`w-32 h-5 rounded animate-pulse ${
        isDarkMode ? "bg-gray-700" : "bg-gray-200"
      }`} />

      {/* Attributes grid skeleton */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`w-24 h-14 rounded-lg animate-pulse ${
              isDarkMode ? "bg-gray-700" : "bg-gray-200"
            }`}
          />
        ))}
      </div>
    </div>
  </div>
);

// Utility function to localize attribute titles and values
const localizeAttribute = (
  key: string,
  value: unknown
): { title: string; localizedValue: string } => {
  // Simple localization mapping - you can expand this based on your needs
  const titleMappings: Record<string, string> = {
    color: "Color",
    size: "Size",
    material: "Material",
    brand: "Brand",
    model: "Model",
    weight: "Weight",
    dimensions: "Dimensions",
    warranty: "Warranty",
    origin: "Origin",
    category: "Category",
    subcategory: "Subcategory",
    condition: "Condition",
    style: "Style",
    type: "Type",
  };

  const title =
    titleMappings[key.toLowerCase()] ||
    key.charAt(0).toUpperCase() + key.slice(1);

  // Handle different value types
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

  return { title, localizedValue };
};

const DynamicAttributesWidget: React.FC<DynamicAttributesWidgetProps> = ({
  product,
  isLoading = false,
  isDarkMode = false,
}) => {
  if (isLoading || !product) {
    return <LoadingSkeleton isDarkMode={isDarkMode} />;
  }

  if (!product.attributes || Object.keys(product.attributes).length === 0) {
    return null;
  }

  // Filter and format attributes
  const formattedAttributes: Array<{ title: string; value: string }> = [];

  Object.entries(product.attributes).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      try {
        const { title, localizedValue } = localizeAttribute(key, value);
        if (localizedValue.trim()) {
          formattedAttributes.push({ title, value: localizedValue });
        }
      } catch (error) {
        console.error("Error localizing attribute", key, error);
        // Fallback
        formattedAttributes.push({
          title: key,
          value: value.toString(),
        });
      }
    }
  });

  if (formattedAttributes.length === 0) {
    return null;
  }

  return (
    <div className={`w-full shadow-sm border-b ${
      isDarkMode 
        ? "bg-gray-800 border-gray-700" 
        : "bg-white border-gray-100"
    }`}>
      <div className="p-4 space-y-4">
        {/* Header */}
        <h3 className={`text-lg font-bold ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}>
          Product Details
        </h3>

        {/* Attributes grid */}
        <div className="flex flex-wrap gap-2">
          {formattedAttributes.map((attr, index) => (
            <AttributeCard 
              key={index} 
              title={attr.title} 
              value={attr.value}
              isDarkMode={isDarkMode}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default DynamicAttributesWidget;