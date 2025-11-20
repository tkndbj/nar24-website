// context/ProductCacheProvider.tsx
"use client";

import React, { createContext, useContext, useRef, ReactNode } from 'react';
import { Product } from '@/app/models/Product';

interface ProductCacheContextType {
  getProduct: (id: string) => Product | null;
  setProduct: (id: string, product: Product) => void;
  clearProduct: (id: string) => void;
}

const ProductCacheContext = createContext<ProductCacheContextType | null>(null);

export const ProductCacheProvider = ({ children }: { children: ReactNode }) => {
  // ✅ Use useRef to persist across renders without causing re-renders
  const cacheRef = useRef<Map<string, { product: Product; timestamp: number }>>(
    new Map()
  );

  const getProduct = (id: string): Product | null => {
    const cached = cacheRef.current.get(id);
    if (!cached) return null;

    // Check if cache is still valid (5 minutes)
    const age = Date.now() - cached.timestamp;
    const MAX_AGE = 5 * 60 * 1000;

    if (age > MAX_AGE) {
      cacheRef.current.delete(id);
      return null;
    }

    return cached.product;
  };

  const setProduct = (id: string, product: Product) => {
    cacheRef.current.set(id, {
      product,
      timestamp: Date.now(),
    });

    // ✅ Limit cache size to prevent memory leaks (keep last 50 products)
    if (cacheRef.current.size > 50) {
      // Remove oldest entry
      const firstKey = cacheRef.current.keys().next().value;
      if (firstKey) {
        cacheRef.current.delete(firstKey);
      }
    }
  };

  const clearProduct = (id: string) => {
    cacheRef.current.delete(id);
  };

  return (
    <ProductCacheContext.Provider value={{ getProduct, setProduct, clearProduct }}>
      {children}
    </ProductCacheContext.Provider>
  );
};

export const useProductCache = () => {
  const context = useContext(ProductCacheContext);
  if (!context) {
    throw new Error('useProductCache must be used within ProductCacheProvider');
  }
  return context;
};