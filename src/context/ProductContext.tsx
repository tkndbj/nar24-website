// context/ProductContext.tsx
"use client";
import React, { createContext, useContext, useState, useEffect } from "react";
import { productStorage } from "../app/utils/productStorage";

interface ProductData {
  title: string;
  description: string;
  price: string;
  quantity: string;
  condition: string;
  deliveryOption: string;
  category: string;
  subcategory: string;
  subsubcategory: string;
  brand: string;
  attributes: { [key: string]: string | string[] | number | boolean };
  phone: string;
  region: string;
  address: string;
  ibanOwnerName: string;
  ibanOwnerSurname: string;
  iban: string;
  shopId: string | null;
}

interface ProductFiles {
  images: File[];
  video: File | null;
  selectedColorImages: {
    [key: string]: { quantity: string; image: File | null };
  };
}

interface ProductContextType {
  productData: ProductData | null;
  productFiles: ProductFiles;
  saveProductForPreview: (
    data: ProductData,
    files: ProductFiles
  ) => Promise<void>;
  clearProductData: () => Promise<void>;
  isLoading: boolean;
  isRestored: boolean;
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);

export const useProduct = () => {
  const context = useContext(ProductContext);
  if (!context) {
    throw new Error("useProduct must be used within ProductProvider");
  }
  return context;
};

export const ProductProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [productData, setProductData] = useState<ProductData | null>(null);
  const [productFiles, setProductFiles] = useState<ProductFiles>({
    images: [],
    video: null,
    selectedColorImages: {},
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isRestored, setIsRestored] = useState(false);

  // Auto-restore from IndexedDB on mount
  useEffect(() => {
    const restoreFromStorage = async () => {
      if (isRestored) return; // Prevent multiple restores

      setIsLoading(true);
      try {
        const stored = await productStorage.getCurrentProduct();
        if (stored) {
          setProductData(stored.data);
          setProductFiles(stored.files);
          console.log("✅ Product context restored from IndexedDB");
        }
      } catch (error) {
        console.warn("Failed to restore from IndexedDB:", error);
      } finally {
        setIsLoading(false);
        setIsRestored(true);
      }
    };

    restoreFromStorage();
  }, [isRestored]);

  const saveProductForPreview = async (
    data: ProductData,
    files: ProductFiles
  ) => {
    setIsLoading(true);
    try {
      // Save to context immediately (fast)
      setProductData(data);
      setProductFiles(files);

      // Also save to IndexedDB (backup)
      await productStorage.saveCurrentProduct(data, files);

      console.log("✅ Product saved to both context and IndexedDB");
    } catch (error) {
      console.error("Failed to save to IndexedDB:", error);
      // Context save still worked, so don't throw error
    } finally {
      setIsLoading(false);
    }
  };

  const clearProductData = async () => {
    setIsLoading(true);
    try {
      // Clear context immediately
      setProductData(null);
      setProductFiles({
        images: [],
        video: null,
        selectedColorImages: {},
      });

      // Also clear IndexedDB
      await productStorage.clearCurrentProduct();

      console.log("✅ Product cleared from both context and IndexedDB");
    } catch (error) {
      console.error("Failed to clear IndexedDB:", error);
      // Context clear still worked
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ProductContext.Provider
      value={{
        productData,
        productFiles,
        saveProductForPreview,
        clearProductData,
        isLoading,
        isRestored,
      }}
    >
      {children}
    </ProductContext.Provider>
  );
};
