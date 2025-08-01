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
}

const AttributeCard: React.FC<AttributeCardProps> = ({ title, value }) => (
  <div className="inline-flex flex-col px-3 py-2 bg-gray-50 dark:bg-gray-900 rounded-lg border border-orange-400 dark:border-orange-500">
    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 truncate">
      {title}
    </span>
    <span className="text-sm font-medium text-gray-900 dark:text-white">
      {value}
    </span>
  </div>
);

const LoadingSkeleton: React.FC = () => (
  <div className="w-full bg-white dark:bg-gray-800 shadow-sm border-b border-gray-100 dark:border-gray-700">
    <div className="p-4 space-y-4">
      {/* Header skeleton */}
      <div className="w-32 h-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />

      {/* Attributes grid skeleton */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="w-24 h-14 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"
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
}) => {
  if (isLoading || !product) {
    return <LoadingSkeleton />;
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
    <div className="w-full bg-white dark:bg-gray-800 shadow-sm border-b border-gray-100 dark:border-gray-700">
      <div className="p-4 space-y-4">
        {/* Header */}
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">
          Product Details
        </h3>

        {/* Attributes grid */}
        <div className="flex flex-wrap gap-2">
          {formattedAttributes.map((attr, index) => (
            <AttributeCard key={index} title={attr.title} value={attr.value} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default DynamicAttributesWidget;
