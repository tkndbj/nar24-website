// src/types/stepComponentTypes.ts

// Base interface that all step components should implement
export interface BaseStepProps {
  category: string;
  subcategory?: string;
  subsubcategory?: string;
  initialAttributes?: { [key: string]: unknown };
  onSave: (result: { [key: string]: unknown }) => void;
  onCancel?: () => void;
}

// Brand step specific props
export interface BrandStepProps extends BaseStepProps {
  initialBrand?: string;
}

// Color step specific props - handles file uploads
// Note: Color step has a special onSave signature to handle File objects and null results
export interface ColorStepProps {
  category: string;
  subcategory?: string;
  subsubcategory?: string;
  initialAttributes?: { [key: string]: unknown };
  initialSelectedColors?: { [key: string]: File | null };
  onSave: (
    result: { [key: string]: { [key: string]: unknown } } | null
  ) => void;
  onCancel?: () => void;
}

// Clothing step specific props
export interface ClothingStepProps extends BaseStepProps {
  initialAttributes?: {
    clothingSizes?: string[];
    clothingFit?: string;
    clothingType?: string;
    [key: string]: unknown;
  };
}

// Computer components step props - includes additional attributes
export interface ComputerComponentsStepProps extends BaseStepProps {
  initialAttributes?: {
    computerComponent?: string;
    [key: string]: unknown;
  };
}

// Consoles step props - includes brand and variant attributes
export interface ConsolesStepProps extends BaseStepProps {
  initialAttributes?: {
    consoleBrand?: string;
    consoleVariant?: string;
    [key: string]: unknown;
  };
}

// Footwear step props - includes sizes attributes
export interface FootwearStepProps extends BaseStepProps {
  initialAttributes?: {
    footwearSizes?: string[];
    [key: string]: unknown;
  };
}

// Gender step props - includes gender attribute
export interface GenderStepProps extends BaseStepProps {
  initialAttributes?: {
    gender?: string;
    [key: string]: unknown;
  };
}

// Jewelery material step props - includes materials attributes
export interface JeweleryMaterialStepProps extends BaseStepProps {
  initialAttributes?: {
    jewelryMaterials?: string[];
    [key: string]: unknown;
  };
}

// Jewelery type step props - includes type attribute
export interface JeweleryTypeStepProps extends BaseStepProps {
  initialAttributes?: {
    jewelryType?: string;
    [key: string]: unknown;
  };
}

// Kitchen appliances step props - includes appliance attribute
export interface KitchenAppliancesStepProps extends BaseStepProps {
  initialAttributes?: {
    kitchenAppliance?: string;
    [key: string]: unknown;
  };
}

// Pant detail step props - includes sizes attributes
export interface PantDetailStepProps extends BaseStepProps {
  initialAttributes?: {
    pantSizes?: string[];
    [key: string]: unknown;
  };
}

// White goods step props - includes white good attribute
export interface WhiteGoodsStepProps extends BaseStepProps {
  initialAttributes?: {
    whiteGood?: string;
    [key: string]: unknown;
  };
}

// Generic step component type
export type StepComponent = React.ComponentType<
  BaseStepProps | BrandStepProps | ColorStepProps
>;

// Step result types for better type safety
export interface GenericStepResult {
  [key: string]: string | string[] | number | boolean;
}

export interface ColorStepResult {
  [colorName: string]: {
    image: File | null;
    quantity: number;
  };
}

export interface BrandStepResult extends GenericStepResult {
  brand: string;
}
