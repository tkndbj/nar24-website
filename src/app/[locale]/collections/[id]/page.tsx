"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  DocumentSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  ArrowLeft,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";
import Image from "next/image";
import { ProductCard } from "@/app/components/ProductCard";
import { globalBrands } from "@/constants/brands";

// Interfaces
interface Product {
  id: string;
  productName: string;
  price: number;
  originalPrice?: number;
  discountPercentage?: number;
  currency: string;
  imageUrls: string[];
  colorImages: Record<string, string[]>;
  description: string;
  brandModel?: string;
  condition: string;
  quantity?: number;
  averageRating: number;
  isBoosted: boolean;
  deliveryOption?: string;
  campaignName?: string;
  createdAt: Timestamp;
  category?: string;
  subcategory?: string;
  subsubcategory?: string;
  availableColors?: string[];
}

interface CollectionData {
  name: string;
  imageUrl?: string;
  productIds: string[];
}

interface FilterState {
  subcategories: string[];
  colors: string[];
  brands: string[];
  minPrice?: number;
  maxPrice?: number;
}

// Available colors (same as dynamic market page)
const availableColors = [
  { name: "Blue", color: "#2196F3" },
  { name: "Orange", color: "#FF9800" },
  { name: "Yellow", color: "#FFEB3B" },
  { name: "Black", color: "#000000" },
  { name: "Brown", color: "#795548" },
  { name: "Dark Blue", color: "#00008B" },
  { name: "Gray", color: "#9E9E9E" },
  { name: "Pink", color: "#E91E63" },
  { name: "Red", color: "#F44336" },
  { name: "White", color: "#FFFFFF" },
  { name: "Green", color: "#4CAF50" },
  { name: "Purple", color: "#9C27B0" },
  { name: "Teal", color: "#009688" },
  { name: "Lime", color: "#CDDC39" },
  { name: "Cyan", color: "#00BCD4" },
  { name: "Magenta", color: "#FF00FF" },
  { name: "Indigo", color: "#3F51B5" },
  { name: "Amber", color: "#FFC107" },
  { name: "Deep Orange", color: "#FF5722" },
  { name: "Light Blue", color: "#03A9F4" },
  { name: "Deep Purple", color: "#673AB7" },
  { name: "Light Green", color: "#8BC34A" },
  { name: "Dark Gray", color: "#444444" },
  { name: "Beige", color: "#F5F5DC" },
  { name: "Turquoise", color: "#40E0D0" },
  { name: "Violet", color: "#EE82EE" },
  { name: "Olive", color: "#808000" },
  { name: "Maroon", color: "#800000" },
  { name: "Navy", color: "#000080" },
  { name: "Silver", color: "#C0C0C0" },
];

// Shimmer Loading Component
const ShimmerLoading: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  const baseColor = isDark ? "#2D2A42" : "#E5E5E5";

  return (
    <div className="min-h-screen">
      {/* Cover Image Shimmer */}
      <div
        className="h-64 w-full animate-pulse"
        style={{ backgroundColor: baseColor }}
      />

      {/* Main Content Shimmer */}
      <div className="max-w-7xl mx-auto">
        <div className="flex">
          {/* Sidebar Shimmer */}
          <div className="w-64 flex-shrink-0 p-4">
            <div
              className="h-32 w-full rounded animate-pulse"
              style={{ backgroundColor: baseColor }}
            />
          </div>
          
          {/* Content Shimmer */}
          <div className="flex-1 min-w-0">
            <div
              className={`p-4 shadow-lg ${
                isDark ? "bg-gray-800" : "bg-white"
              }`}
            >
              <div
                className="h-6 w-48 rounded animate-pulse"
                style={{ backgroundColor: baseColor }}
              />
            </div>

            {/* Products Shimmer */}
            <div className="p-4">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 9 }).map((_, index) => (
                  <div key={index} className="space-y-2">
                    <div
                      className="aspect-square rounded-lg animate-pulse"
                      style={{ backgroundColor: baseColor }}
                    />
                    <div
                      className="h-4 w-full rounded animate-pulse"
                      style={{ backgroundColor: baseColor }}
                    />
                    <div
                      className="h-4 w-3/4 rounded animate-pulse"
                      style={{ backgroundColor: baseColor }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Full Screen Image View Component
const FullScreenImageView: React.FC<{
  imageUrl: string;
  onClose: () => void;
}> = ({ imageUrl, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
      <div className="relative w-full h-full">
        <Image
          src={imageUrl}
          alt="Collection Cover"
          fill
          className="object-contain"
          onError={() => {
            console.error("Failed to load full screen image");
          }}
        />
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 w-10 h-10 bg-black bg-opacity-50 rounded-full flex items-center justify-center"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
};

export default function CollectionPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations('Collection');
  const collectionId = params?.id as string;
  const [shopId, setShopId] = useState<string>("");
  const [collectionName, setCollectionName] = useState<string>("");

  // State
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [collectionData, setCollectionData] = useState<CollectionData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [boostedProducts, setBoostedProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [showFullScreenImage, setShowFullScreenImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  

  // Filter states (same as dynamic market page)
  const [filters, setFilters] = useState<FilterState>({
    subcategories: [],
    colors: [],
    brands: [],
    minPrice: undefined,
    maxPrice: undefined,
  });

  // Available subcategories based on products in collection
  const [availableSubcategories, setAvailableSubcategories] = useState<string[]>([]);

  // Filter UI states (same as dynamic market page)
  const [expandedSections, setExpandedSections] = useState({
    subcategory: true,
    color: true,
    brand: true,
    price: true,
  });

  const [brandSearch, setBrandSearch] = useState("");
  const [minPriceInput, setMinPriceInput] = useState("");
  const [maxPriceInput, setMaxPriceInput] = useState("");
  const [showSidebar, setShowSidebar] = useState(false);

  // Computed values for scroll animations
  const overlayOpacity = useMemo(() => {
    return Math.min(0.3 + (scrollOffset / 200) * 0.4, 0.7);
  }, [scrollOffset]);

  const titleOpacity = useMemo(() => {
    return Math.min(Math.max((scrollOffset - 75) / 50, 0), 1);
  }, [scrollOffset]);

  const headerOpacity = useMemo(() => {
    return Math.max(1 - scrollOffset / 100, 0);
  }, [scrollOffset]);

  const showHeaderBackground = scrollOffset > 50;

  // Check dark mode
  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDarkMode(document.documentElement.classList.contains("dark"));
      }
    };

    checkTheme();
    const observer = new MutationObserver(checkTheme);
    if (typeof document !== "undefined") {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    return () => observer.disconnect();
  }, []);

  // Get shopId and collectionName from sessionStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedShopId = sessionStorage.getItem('collectionShopId');
      const storedCollectionName = sessionStorage.getItem('collectionName');
      
      if (storedShopId) {
        setShopId(storedShopId);
      }
      
      if (storedCollectionName) {
        setCollectionName(storedCollectionName);
      }
    }
  }, []);

  // Load collection data
  useEffect(() => {
    if (!collectionId || !shopId) {
      if (collectionId && !shopId) {
        // Show loading state until shopId is retrieved from sessionStorage
        return;
      }
      setError("Missing collection or shop ID");
      setIsLoading(false);
      return;
    }
  
    loadCollectionData();
  }, [collectionId, shopId]);

  // Extract available subcategories from products
  useEffect(() => {
    if (products.length > 0) {
      const subcats = Array.from(
        new Set(
          products
            .map(p => p.subcategory)
            .filter(Boolean)
        )
      ).sort();
      setAvailableSubcategories(subcats as string[]);
    }
  }, [products]);

  // Apply filters whenever filters or products change
  useEffect(() => {
    applyFilters();
  }, [filters, products]);

  // Scroll listener
  useEffect(() => {
    const handleScroll = () => {
      setScrollOffset(window.scrollY);

      // Load more products when near bottom
      if (
        window.innerHeight + window.scrollY >=
        document.body.offsetHeight * 0.8
      ) {
        if (!isLoadingMore && hasMore) {
          loadMoreProducts();
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isLoadingMore, hasMore]);

  // Cleanup sessionStorage on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem('collectionShopId');
        sessionStorage.removeItem('collectionName');
      }
    };
  }, []);

  const loadCollectionData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load collection metadata
      const collectionDoc = await getDoc(
        doc(db, "shops", shopId, "collections", collectionId)
      );

      if (!collectionDoc.exists()) {
        setError("Collection not found");
        return;
      }

      const data = collectionDoc.data() as CollectionData;
      setCollectionData(data);

      const productIds = data.productIds || [];
      if (productIds.length === 0) {
        setHasMore(false);
        return;
      }

      // Load products
      await loadProducts(productIds);
    } catch (err) {
      console.error("Error loading collection:", err);
      setError("Failed to load collection");
    } finally {
      setIsLoading(false);
    }
  };

  const loadProducts = async (productIds: string[]) => {
    try {
      const loadedProducts: Product[] = [];

      // Load products in batches of 10 to avoid Firestore limits
      for (let i = 0; i < productIds.length; i += 10) {
        const batch = productIds.slice(i, i + 10);
        
        const q = query(
          collection(db, "shop_products"),
          where("__name__", "in", batch)
        );
        
        const snapshot = await getDocs(q);
        
        snapshot.docs.forEach((doc) => {
          try {
            const productData = { id: doc.id, ...doc.data() } as Product;
            loadedProducts.push(productData);
          } catch (err) {
            console.error(`Error parsing product ${doc.id}:`, err);
          }
        });
      }

      // Sort by creation date (newest first)
      loadedProducts.sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          return b.createdAt.toMillis() - a.createdAt.toMillis();
        }
        return 0;
      });

      setProducts(loadedProducts);
    } catch (err) {
      console.error("Error loading products:", err);
      setError("Failed to load products");
    }
  };

  const applyFilters = () => {
    if (!products.length) return;

    let filtered = [...products];

    // Apply subcategory filter
    if (filters.subcategories.length > 0) {
      filtered = filtered.filter(product => {
        if (!product.subcategory) return false;
        return filters.subcategories.some(filterSub => {
          const normalizedFilterSub = filterSub.toLowerCase();
          const productSubcategory = product.subcategory!.toLowerCase();
          return productSubcategory === normalizedFilterSub || 
                 productSubcategory.includes(normalizedFilterSub) ||
                 normalizedFilterSub.includes(productSubcategory);
        });
      });
    }

    // Apply color filter
    if (filters.colors.length > 0) {
      filtered = filtered.filter(product => {
        if (!product.availableColors || product.availableColors.length === 0) return false;
        return filters.colors.some(filterColor => {
          const normalizedFilterColor = filterColor.toLowerCase();
          return product.availableColors!.some(productColor => 
            productColor.toLowerCase() === normalizedFilterColor ||
            productColor.toLowerCase().includes(normalizedFilterColor) ||
            normalizedFilterColor.includes(productColor.toLowerCase())
          );
        });
      });
    }

    // Apply brand filter
    if (filters.brands.length > 0) {
      filtered = filtered.filter(product => {
        if (!product.brandModel) return false;
        return filters.brands.some(filterBrand => {
          return product.brandModel!.toLowerCase() === filterBrand.toLowerCase() ||
                 product.brandModel!.toLowerCase().includes(filterBrand.toLowerCase()) ||
                 filterBrand.toLowerCase().includes(product.brandModel!.toLowerCase());
        });
      });
    }

    // Apply price filters
    if (filters.minPrice !== undefined) {
      filtered = filtered.filter(product => product.price >= filters.minPrice!);
    }

    if (filters.maxPrice !== undefined) {
      filtered = filtered.filter(product => product.price <= filters.maxPrice!);
    }

    // Separate boosted and regular products
    const boosted = filtered.filter(p => p.isBoosted);
    const regular = filtered.filter(p => !p.isBoosted);
    
    setBoostedProducts(boosted);
    setFilteredProducts(regular);
  };

  const loadMoreProducts = async () => {
    // Since we're loading from a fixed list, we don't need real pagination
    // This is just for consistency with your Flutter implementation
    if (isLoadingMore) return;

    setIsLoadingMore(true);
    
    try {
      // Simulate loading delay
      await new Promise(resolve => setTimeout(resolve, 500));
      setHasMore(false);
    } catch (err) {
      console.error("Error loading more products:", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Filter handlers (same as dynamic market page)
  const toggleFilter = (type: keyof FilterState, value: string) => {
    setFilters((prev) => {
      const currentList = prev[type] as string[];
      const newList = currentList.includes(value)
        ? currentList.filter((item) => item !== value)
        : [...currentList, value];

      return { ...prev, [type]: newList };
    });
  };

  const setPriceFilter = () => {
    const min = minPriceInput ? parseFloat(minPriceInput) : undefined;
    const max = maxPriceInput ? parseFloat(maxPriceInput) : undefined;

    // Validate price range
    if (min !== undefined && max !== undefined && min > max) {
      alert("Minimum price cannot be greater than maximum price");
      return;
    }

    setFilters((prev) => ({
      ...prev,
      minPrice: min,
      maxPrice: max,
    }));
  };

  const clearAllFilters = () => {
    setFilters({
      subcategories: [],
      colors: [],
      brands: [],
      minPrice: undefined,
      maxPrice: undefined,
    });
    setMinPriceInput("");
    setMaxPriceInput("");
  };

  const getActiveFiltersCount = () => {
    return (
      filters.subcategories.length +
      filters.colors.length +
      filters.brands.length +
      (filters.minPrice !== undefined || filters.maxPrice !== undefined ? 1 : 0)
    );
  };

  const filteredBrands = globalBrands.filter((brand) =>
    brand.toLowerCase().includes(brandSearch.toLowerCase())
  );

  const handleProductTap = (productId: string) => {
    router.push(`/productdetail/${productId}`);
  };

  const handleFavoriteToggle = (productId: string) => {
    // TODO: Implement favorite toggle
    console.log("Toggle favorite:", productId);
  };

  const handleAddToCart = (productId: string) => {
    // TODO: Implement add to cart
    console.log("Add to cart:", productId);
  };

  const handleColorSelect = (productId: string, color: string) => {
    console.log("Color selected for product:", productId, color);
  };

  if (isLoading) {
    return <ShimmerLoading isDark={isDarkMode} />;
  }

  if (error) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${
        isDarkMode ? "bg-gray-900" : "bg-gray-50"
      }`}>
        <div className="text-center p-8">
          <h1 className={`text-xl font-bold mb-4 ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}>
            {error}
          </h1>
          <button
            onClick={() => router.back()}
            className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
          >
            {t("goBack")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen w-full ${
      isDarkMode ? "bg-gray-900" : "bg-gray-50"
    }`}>
      {/* App Bar Overlay */}
      <div
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-200 ${
          showHeaderBackground
            ? isDarkMode
              ? "bg-gray-900 shadow-lg"
              : "bg-gray-50 shadow-lg"
            : "bg-transparent"
        }`}
      >
        <div className="safe-area px-4 py-3">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            {/* Back Button */}
            <button
              onClick={() => router.back()}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                showHeaderBackground
                  ? isDarkMode
                    ? "bg-white/10 hover:bg-white/20"
                    : "bg-black/5 hover:bg-black/10"
                  : "bg-black/60 hover:bg-black/70"
              }`}
            >
              <ArrowLeft
                className={`w-5 h-5 ${
                  showHeaderBackground
                    ? isDarkMode ? "text-white" : "text-black"
                    : "text-white"
                }`}
              />
            </button>

            {/* Collection Name in Header */}
            {titleOpacity > 0 && (
              <div
                className="flex-1 mx-3"
                style={{ opacity: titleOpacity }}
              >
                <h1
                  className={`text-lg font-bold truncate ${
                    isDarkMode ? "text-white" : "text-black"
                  }`}
                >
                  {collectionData?.name || collectionName || t("collection")}
                </h1>
              </div>
            )}

            {/* Mobile Filter Button */}
            <button
              onClick={() => setShowSidebar(true)}
              className={`lg:hidden flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                showHeaderBackground
                  ? isDarkMode
                    ? "bg-white/10 border-white/20 hover:bg-white/20"
                    : "bg-black/5 border-black/10 hover:bg-black/10"
                  : "bg-white/20 border-white/30 hover:bg-white/30"
              }`}
            >
              <Filter
                className={`w-4 h-4 ${
                  showHeaderBackground
                    ? isDarkMode ? "text-white" : "text-black"
                    : "text-white"
                }`}
              />
              {getActiveFiltersCount() > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                  {getActiveFiltersCount()}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Cover Image */}
      {collectionData?.imageUrl && (
        <div className="relative h-64 pt-16">
          <button
            onClick={() => setShowFullScreenImage(true)}
            className="w-full h-full relative"
          >
            <Image
              src={collectionData.imageUrl}
              alt={collectionData.name}
              fill
              className="object-cover"
              onError={() => {
                console.error("Failed to load collection image");
              }}
            />
            
            {/* Dark Overlay */}
            <div
              className="absolute inset-0 bg-black transition-opacity duration-100"
              style={{ opacity: overlayOpacity }}
            />
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto">
        <div className="flex">
          {/* Mobile Filter Button */}
          <div className="lg:hidden fixed bottom-4 right-4 z-50">
            <button
              onClick={() => setShowSidebar(true)}
              className={`p-3 rounded-full shadow-lg ${
                isDarkMode ? "bg-orange-600" : "bg-orange-500"
              } text-white`}
            >
              <Filter size={24} />
              {getActiveFiltersCount() > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                  {getActiveFiltersCount()}
                </span>
              )}
            </button>
          </div>

          {/* Filter Sidebar */}
          <div
            className={`
              fixed lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] top-16 left-0 h-[calc(100vh-4rem)] w-64 transform transition-transform duration-300 z-40
              ${
                showSidebar
                  ? "translate-x-0"
                  : "-translate-x-full lg:translate-x-0"
              }
              ${isDarkMode ? "bg-gray-800" : "bg-white"}
              border-r ${isDarkMode ? "border-gray-700" : "border-gray-200"}
              overflow-y-auto overflow-x-hidden flex-shrink-0
            `}
          >
            {/* Mobile Close Button */}
            <div className="lg:hidden p-3 border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowSidebar(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
              >
                <X
                  size={18}
                  className={isDarkMode ? "text-gray-400" : "text-gray-600"}
                />
              </button>
            </div>

            {/* Filter Content */}
            <div className="p-3">
              {/* Clear All Filters Button */}
              {getActiveFiltersCount() > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="w-full mb-3 py-1.5 text-xs text-orange-500 border border-orange-500 rounded hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                >
                  Clear All Filters ({getActiveFiltersCount()})
                </button>
              )}

              <div className="space-y-4">
                {/* Subcategories Filter */}
                {availableSubcategories.length > 0 && (
                  <div>
                    <button
                      onClick={() =>
                        setExpandedSections((prev) => ({
                          ...prev,
                          subcategory: !prev.subcategory,
                        }))
                      }
                      className="w-full flex items-center justify-between text-left py-1.5"
                    >
                      <span
                        className={`font-medium text-xs ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        Subcategories
                      </span>
                      {expandedSections.subcategory ? (
                        <ChevronUp size={14} className="text-gray-400" />
                      ) : (
                        <ChevronDown size={14} className="text-gray-400" />
                      )}
                    </button>

                    {expandedSections.subcategory && (
                      <div className="mt-1.5 space-y-1.5 max-h-40 overflow-y-auto">
                        {availableSubcategories.map((sub) => (
                          <label
                            key={sub}
                            className="flex items-center space-x-2 cursor-pointer py-0.5"
                          >
                            <input
                              type="checkbox"
                              checked={filters.subcategories.includes(sub)}
                              onChange={() => toggleFilter("subcategories", sub)}
                              className="w-3 h-3 text-orange-500 rounded border-gray-300 focus:ring-orange-500"
                            />
                            <span
                              className={`text-xs ${
                                isDarkMode ? "text-gray-300" : "text-gray-700"
                              } leading-tight`}
                            >
                              {sub}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Brands Filter */}
                <div>
                  <button
                    onClick={() =>
                      setExpandedSections((prev) => ({
                        ...prev,
                        brand: !prev.brand,
                      }))
                    }
                    className="w-full flex items-center justify-between text-left py-1.5"
                  >
                    <span
                      className={`font-medium text-xs ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      Brands
                    </span>
                    {expandedSections.brand ? (
                      <ChevronUp size={14} className="text-gray-400" />
                    ) : (
                      <ChevronDown size={14} className="text-gray-400" />
                    )}
                  </button>

                  {expandedSections.brand && (
                    <div className="mt-1.5 space-y-2">
                      <div className="relative">
                        <Search
                          size={14}
                          className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400"
                        />
                        <input
                          type="text"
                          placeholder="Search brands..."
                          value={brandSearch}
                          onChange={(e) => setBrandSearch(e.target.value)}
                          className={`
                              w-full pl-8 pr-3 py-1.5 text-xs border rounded
                              ${
                                isDarkMode
                                  ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                                  : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                              }
                              focus:ring-1 focus:ring-orange-500 focus:border-orange-500
                            `}
                        />
                      </div>

                      <div className="max-h-40 overflow-y-auto space-y-1.5">
                        {filteredBrands.map((brand) => (
                          <label
                            key={brand}
                            className="flex items-center space-x-2 cursor-pointer py-0.5"
                          >
                            <input
                              type="checkbox"
                              checked={filters.brands.includes(brand)}
                              onChange={() => toggleFilter("brands", brand)}
                              className="w-3 h-3 text-orange-500 rounded border-gray-300 focus:ring-orange-500"
                            />
                            <span
                              className={`text-xs ${
                                isDarkMode ? "text-gray-300" : "text-gray-700"
                              } leading-tight`}
                            >
                              {brand}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Colors Filter */}
                <div>
                  <button
                    onClick={() =>
                      setExpandedSections((prev) => ({
                        ...prev,
                        color: !prev.color,
                      }))
                    }
                    className="w-full flex items-center justify-between text-left py-1.5"
                  >
                    <span
                      className={`font-medium text-xs ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      Colors
                    </span>
                    {expandedSections.color ? (
                      <ChevronUp size={14} className="text-gray-400" />
                    ) : (
                      <ChevronDown size={14} className="text-gray-400" />
                    )}
                  </button>

                  {expandedSections.color && (
                    <div className="mt-1.5 space-y-1.5 max-h-40 overflow-y-auto">
                      {availableColors.map((colorData) => (
                        <label
                          key={colorData.name}
                          className="flex items-center space-x-2 cursor-pointer py-0.5"
                        >
                          <input
                            type="checkbox"
                            checked={filters.colors.includes(colorData.name)}
                            onChange={() =>
                              toggleFilter("colors", colorData.name)
                            }
                            className="w-3 h-3 text-orange-500 rounded border-gray-300 focus:ring-orange-500"
                          />
                          <div
                            className="w-3 h-3 rounded border border-gray-300 flex-shrink-0"
                            style={{ backgroundColor: colorData.color }}
                          />
                          <span
                            className={`text-xs ${
                              isDarkMode ? "text-gray-300" : "text-gray-700"
                            } leading-tight`}
                          >
                            {colorData.name}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Price Range Filter */}
                <div>
                  <button
                    onClick={() =>
                      setExpandedSections((prev) => ({
                        ...prev,
                        price: !prev.price,
                      }))
                    }
                    className="w-full flex items-center justify-between text-left py-1.5"
                  >
                    <span
                      className={`font-medium text-xs ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      Price Range
                    </span>
                    {expandedSections.price ? (
                      <ChevronUp size={14} className="text-gray-400" />
                    ) : (
                      <ChevronDown size={14} className="text-gray-400" />
                    )}
                  </button>

                  {expandedSections.price && (
                    <div className="mt-1.5 space-y-2">
                      <div className="flex space-x-1.5">
                        <input
                          type="number"
                          placeholder="Min"
                          value={minPriceInput}
                          onChange={(e) => setMinPriceInput(e.target.value)}
                          className={`
                            w-16 px-1.5 py-1.5 text-xs border rounded
                            ${
                              isDarkMode
                                ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                                : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                            }
                            focus:ring-1 focus:ring-orange-500 focus:border-orange-500
                          `}
                        />
                        <span className="text-xs text-gray-500 self-center">
                          -
                        </span>
                        <input
                          type="number"
                          placeholder="Max"
                          value={maxPriceInput}
                          onChange={(e) => setMaxPriceInput(e.target.value)}
                          className={`
                            w-16 px-1.5 py-1.5 text-xs border rounded
                            ${
                              isDarkMode
                                ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                                : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                            }
                            focus:ring-1 focus:ring-orange-500 focus:border-orange-500
                          `}
                        />
                        <span className="text-xs text-gray-500 self-center">
                          TL
                        </span>
                      </div>

                      <button
                        onClick={setPriceFilter}
                        className="w-full py-1.5 bg-orange-500 text-white text-xs font-medium rounded hover:bg-orange-600 transition-colors"
                      >
                        Apply Price Filter
                      </button>

                      {(filters.minPrice !== undefined ||
                        filters.maxPrice !== undefined) && (
                        <div className="text-xs text-orange-500 font-medium">
                          {filters.minPrice || 0} TL - {filters.maxPrice || "∞"}{" "}
                          TL
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Overlay for mobile */}
          {showSidebar && (
            <div
              className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
              onClick={() => setShowSidebar(false)}
            />
          )}

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Collection Name Header */}
            {collectionData && (
              <div
                className={`p-4 shadow-lg transition-opacity duration-150 ${
                  isDarkMode ? "bg-gray-800" : "bg-white"
                }`}
                style={{ opacity: headerOpacity }}
              >
                <h1
                  className={`text-xl font-bold ${
                    isDarkMode ? "text-white" : "text-black"
                  }`}
                >
                  {collectionData.name || collectionName}
                </h1>
                {(filteredProducts.length > 0 || boostedProducts.length > 0) && (
                  <p
                    className={`text-sm mt-1 ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {filteredProducts.length + boostedProducts.length} products found
                    {getActiveFiltersCount() > 0 &&
                      ` (${getActiveFiltersCount()} filters applied)`}
                  </p>
                )}
              </div>
            )}

            {/* Products Grid */}
            <div className="p-4">
              {/* Boosted Products */}
              {boostedProducts.length > 0 && (
                <div className="mb-6">
                  <h2
                    className={`text-lg font-bold mb-4 ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {t("featured")}
                  </h2>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {boostedProducts.map((product) => (
                      <div key={product.id} className="flex justify-center">
                        <ProductCard
                          product={product}
                          onTap={() => handleProductTap(product.id)}
                          onFavoriteToggle={handleFavoriteToggle}
                          onAddToCart={handleAddToCart}
                          onColorSelect={(color) =>
                            handleColorSelect(product.id, color)
                          }
                          showCartIcon={true}
                          isFavorited={false}
                          isInCart={false}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Regular Products */}
              {filteredProducts.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredProducts.map((product) => (
                    <div key={product.id} className="flex justify-center">
                      <ProductCard
                        product={product}
                        onTap={() => handleProductTap(product.id)}
                        onFavoriteToggle={handleFavoriteToggle}
                        onAddToCart={handleAddToCart}
                        onColorSelect={(color) =>
                          handleColorSelect(product.id, color)
                        }
                        showCartIcon={true}
                        isFavorited={false}
                        isInCart={false}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Loading More */}
              {isLoadingMore && (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
                </div>
              )}

              {/* No Products */}
              {filteredProducts.length === 0 && boostedProducts.length === 0 && !isLoading && (
                <div className="text-center py-16">
                  <div
                    className={`text-6xl mb-4 ${
                      isDarkMode ? "text-gray-600" : "text-gray-400"
                    }`}
                  >
                    📦
                  </div>
                  <h3
                    className={`text-lg font-medium mb-2 ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {t("noProductsFound")}
                  </h3>
                  <p
                    className={`text-sm ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {getActiveFiltersCount() > 0
                      ? t("tryAdjustingFilters")
                      : t("noProductsInCollection")}
                  </p>
                  {getActiveFiltersCount() > 0 && (
                    <button
                      onClick={clearAllFilters}
                      className="mt-4 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                    >
                      Clear All Filters
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Spacing */}
            <div className="h-20" />
          </div>
        </div>
      </div>

      {/* Full Screen Image */}
      {showFullScreenImage && collectionData?.imageUrl && (
        <FullScreenImageView
          imageUrl={collectionData.imageUrl}
          onClose={() => setShowFullScreenImage(false)}
        />
      )}
    </div>
  );
}