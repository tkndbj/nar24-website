// src/components/List-Product/DynamicFlowRenderer.tsx
"use client";

import React from "react";
import BrandStep from "./Brand";
import ClothingStep from "./ClothingDetail";
import ColorOptionStep from "./ColorOption";
import ComputerComponentsStep from "./ComputerComponents";
import ConsolesStep from "./Consoles";
import FootwearDetailStep from "./FootwearDetail";
import GenderStep from "./Gender";
import JeweleryMaterialStep from "./JeweleryMaterial";
import JewelerTypeStep from "./JeweleryType";
import KitchenAppliancesStep from "./KitchenAppliances";
import PantDetailStep from "./PantDetail";
import WhiteGoodsStep from "./WhiteGoods";

// Add Error Boundary Component
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; stepId: string },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; stepId: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    console.error("🔥 Error Boundary caught error in step:", error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(
      "🔥 Error Boundary details for step",
      this.props.stepId,
      ":",
      error,
      errorInfo
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 flex items-center justify-center">
          <div className="max-w-md mx-4">
            <div className="bg-white/70 backdrop-blur-sm rounded-3xl shadow-xl border border-red-200 p-8 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-red-800 mb-2">
                Something went wrong in {this.props.stepId} step
              </h2>
              <p className="text-red-600 text-sm mb-4">
                {this.state.error?.message || "Unknown error occurred"}
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    console.log("🔄 Attempting to recover from error...");
                    this.setState({ hasError: false });
                  }}
                  className="w-full px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors font-medium"
                >
                  Try Again
                </button>
                <button
                  onClick={() => {
                    console.log("🔄 Reloading page to recover...");
                    window.location.reload();
                  }}
                  className="w-full px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-xl transition-colors font-medium"
                >
                  Reload Page
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Step component map - matches the stepId from Firestore
const STEP_COMPONENTS = {
  // Your actual Firestore step IDs
  list_brand: BrandStep,
  list_clothing: ClothingStep,
  list_color: ColorOptionStep,
  list_computer_components: ComputerComponentsStep,
  list_consoles: ConsolesStep,
  list_footwear: FootwearDetailStep,
  list_gender: GenderStep,
  list_jewelry_mat: JeweleryMaterialStep,
  list_jewelry_type: JewelerTypeStep,
  list_kitchen_appliances: KitchenAppliancesStep,
  list_pant: PantDetailStep,
  list_white_goods: WhiteGoodsStep,

  // Keep old naming for backward compatibility
  brand: BrandStep,
  clothing: ClothingStep,
  color: ColorOptionStep,
  computer_components: ComputerComponentsStep,
  consoles: ConsolesStep,
  footwear: FootwearDetailStep,
  gender: GenderStep,
  jewelery_material: JeweleryMaterialStep,
  jewelery_type: JewelerTypeStep,
  kitchen_appliances: KitchenAppliancesStep,
  pant_detail: PantDetailStep,
  white_goods: WhiteGoodsStep,
} as const;

interface DynamicFlowRendererProps {
  stepId: string;
  category: string;
  subcategory: string;
  subsubcategory: string;
  initialBrand?: string;
  initialAttributes?: { [key: string]: unknown };
  selectedColorImages?: {
    [key: string]: { quantity: string; image: File | null };
  };
  onStepComplete: (
    result:
      | { [key: string]: unknown }
      | { [key: string]: { [key: string]: unknown } }
      | null
  ) => void;
  onCancel: () => void;
  onBack?: () => void;
}

export default function DynamicFlowRenderer({
  stepId,
  category,
  subcategory,
  subsubcategory,
  initialBrand,
  initialAttributes,
  selectedColorImages,
  onStepComplete,
  onCancel,
  onBack,
}: DynamicFlowRendererProps) {
  // Get the component for this step
  const StepComponent = STEP_COMPONENTS[stepId as keyof typeof STEP_COMPONENTS];

  if (!StepComponent) {
    console.warn(`No component found for step: ${stepId}`);
    console.log("Available step IDs:", Object.keys(STEP_COMPONENTS));
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-2">
            Step Not Available
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            The step &quot;{stepId}&quot; is not implemented yet.
          </p>
          <button
            onClick={onCancel}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // Handle different step types with their specific props
  const getStepProps = () => {
    const baseProps = {
      onSave: onStepComplete,
      onCancel: onBack || onCancel,
      category,
      subcategory,
      subsubcategory,
      initialAttributes,
      onBack,
    };

    switch (stepId) {
      case "brand":
      case "list_brand":
        return {
          ...baseProps,
          initialBrand,
        };

      case "color":
      case "list_color":
        return {
          ...baseProps,
          initialSelectedColors: selectedColorImages
            ? Object.fromEntries(
                Object.entries(selectedColorImages).map(([color, data]) => [
                  color,
                  data.image,
                ])
              )
            : undefined,
        };

      case "clothing":
      case "list_clothing":
      case "footwear":
      case "list_footwear":
      case "pant_detail":
      case "list_pant":
      case "computer_components":
      case "list_computer_components":
      case "consoles":
      case "list_consoles":
      case "gender":
      case "list_gender":
      case "jewelery_material":
      case "list_jewelry_mat":
      case "jewelery_type":
      case "list_jewelry_type":
      case "kitchen_appliances":
      case "list_kitchen_appliances":
      case "white_goods":
      case "list_white_goods":
        return baseProps;

      default:
        return baseProps;
    }
  };

  // Add console logging to track render cycles
  console.log(`🔄 DynamicFlowRenderer rendering step: ${stepId}`);

  // Wrap the StepComponent with ErrorBoundary
  return (
    <ErrorBoundary stepId={stepId}>
      <StepComponent {...getStepProps()} />
    </ErrorBoundary>
  );
}
