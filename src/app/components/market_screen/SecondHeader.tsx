// Fixed SecondHeader.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Grid3x3,
  User2,
  UserCheck,
  Sparkles,
  Baby,
  Laptop,
  ShirtIcon,
  ShoppingBag,
  ChevronRight,
  ChevronLeft,
  Home,
  Wrench,
  Heart,
  Car,
  BookOpen,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { AllInOneCategoryData } from "@/constants/productData";
import { useTranslations } from "next-intl";

interface SecondHeaderProps {
  className?: string;
}

interface CategoryItem {
  id: string;
  name: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  path: string;
}

interface BuyerCategory {
  key: string;
  name: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  subcategories: string[];
}

// Create a wrapper to convert useTranslations to AppLocalizations format
interface AppLocalizations {
  [key: string]: string;
}

const createAppLocalizations = (
  t: (key: string) => string
): AppLocalizations => {
  return new Proxy(
    {},
    {
      get: (target, prop: string) => {
        try {
          return t(prop);
        } catch {
          return prop; // fallback to the key itself if translation doesn't exist
        }
      },
    }
  ) as AppLocalizations;
};

// Icon mapping for buyer categories
const categoryIconMap: Record<
  string,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  Women: User2,
  Men: UserCheck,
  "Mother & Child": Baby,
  "Home & Furniture": Home,
  Electronics: Laptop,
  "Beauty & Personal Care": Sparkles,
  "Bags & Luggage": ShoppingBag,
  "Sports & Outdoor": ShirtIcon,
  "Books, Stationery & Hobby": BookOpen,
  "Tools & Hardware": Wrench,
  "Health & Wellness": Heart,
  Automotive: Car,
};

// Category mapping from URL-friendly to Firestore values
const CATEGORY_MAPPING: { [key: string]: string } = {
  "clothing-fashion": "Clothing & Fashion",
  footwear: "Footwear",
  accessories: "Accessories",
  "bags-luggage": "Bags & Luggage",
  "beauty-personal-care": "Beauty & Personal Care",
  "mother-child": "Mother & Child",
  "home-furniture": "Home & Furniture",
  electronics: "Electronics",
  "sports-outdoor": "Sports & Outdoor",
  "books-stationery-hobby": "Books, Stationery & Hobby",
  "tools-hardware": "Tools & Hardware",
  "pet-supplies": "Pet Supplies",
  automotive: "Automotive",
  "health-wellness": "Health & Wellness",
};

// Reverse mapping from Firestore to URL-friendly
const REVERSE_CATEGORY_MAPPING: { [key: string]: string } = Object.entries(
  CATEGORY_MAPPING
).reduce((acc, [key, value]) => {
  acc[value] = key;
  return acc;
}, {} as { [key: string]: string });

// Mobile drawer states
type DrawerState = "main" | "subcategory" | "subsubcategory";

export default function SecondHeader({ className = "" }: SecondHeaderProps) {
  const [isDark, setIsDark] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showCategoriesMenu, setShowCategoriesMenu] = useState(false);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Mobile drawer states
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);
  const [drawerState, setDrawerState] = useState<DrawerState>("main");
  const [selectedMainCategory, setSelectedMainCategory] =
    useState<BuyerCategory | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(
    null
  );

  const categoriesMenuRef = useRef<HTMLDivElement>(null);
  const categoriesButtonRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const categoriesContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const t = useTranslations();
  const l10n = createAppLocalizations(t);

  // Check if screen is mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // ✅ Fix 3: Handle body scroll when mobile drawer is open/closed
  useEffect(() => {
    if (isMobile && showMobileDrawer) {
      // Disable scrolling when drawer is open
      document.body.style.overflow = 'hidden';
    } else {
      // Re-enable scrolling when drawer is closed
      document.body.style.overflow = 'unset';
    }

    // Cleanup function to ensure scrolling is restored
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showMobileDrawer, isMobile]);

  // Get buyer categories from AllInOneCategoryData
  const getBuyerCategories = (): BuyerCategory[] => {
    return AllInOneCategoryData.kBuyerCategories.map((category) => ({
      key: category.key,
      name: AllInOneCategoryData.localizeBuyerCategoryKey(category.key, l10n),
      icon: categoryIconMap[category.key] || Grid3x3,
      subcategories:
        AllInOneCategoryData.kBuyerSubcategories[category.key] || [],
    }));
  };

  // Generate categories from buyer data
  const getCategories = (): CategoryItem[] => {
    const buyerCategories = getBuyerCategories();

    // Create the "Kategoriler" button first
    const categoriesButton: CategoryItem = {
      id: "categories",
      name: "Kategoriler",
      icon: Grid3x3,
      path: "/categories",
    };

    // Convert buyer categories to category items (take first 7 for display)
    const categoryItems: CategoryItem[] = buyerCategories
      .slice(0, 7)
      .map((buyerCategory) => ({
        id: buyerCategory.key.toLowerCase().replace(/\s+/g, "-"),
        name: buyerCategory.name,
        icon: buyerCategory.icon,
        path: `/category/${buyerCategory.key
          .toLowerCase()
          .replace(/\s+/g, "-")}`,
      }));

    return [categoriesButton, ...categoryItems];
  };

  const buyerCategories = getBuyerCategories();
  const categories = getCategories();

  // Helper function to get localized subcategory name
  const getLocalizedSubcategory = (
    buyerCategory: string,
    subcategory: string
  ): string => {
    return AllInOneCategoryData.localizeBuyerSubcategoryKey(
      buyerCategory,
      subcategory,
      l10n
    );
  };

  // Helper function to get localized sub-subcategory name
  const getLocalizedSubSubcategory = (
    buyerCategory: string,
    subcategory: string,
    subSubcategory: string
  ): string => {
    return AllInOneCategoryData.localizeBuyerSubSubcategoryKey(
      buyerCategory,
      subcategory,
      subSubcategory,
      l10n
    );
  };

  // Helper function to chunk array into groups of 3
  const chunkArray = <T,>(array: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  };

  // Handle theme detection - same as main header
  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDark(document.documentElement.classList.contains("dark"));
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

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const categoryParam = params.get("category");
      setActiveCategory(categoryParam);
    }
  }, [router]);

  // Handle click outside to close menu (desktop only)
  useEffect(() => {
    if (isMobile) return; // Don't handle for mobile

    const handleClickOutside = (event: MouseEvent) => {
      if (
        categoriesMenuRef.current &&
        !categoriesMenuRef.current.contains(event.target as Node) &&
        categoriesButtonRef.current &&
        !categoriesButtonRef.current.contains(event.target as Node)
      ) {
        setShowCategoriesMenu(false);
        setHoveredCategory(null);
      }
    };

    const handleMouseLeave = (event: MouseEvent) => {
      // Only track mouse movement if menu is open
      if (!showCategoriesMenu) return;

      // Check if mouse is leaving both the button and menu areas
      const buttonRect = categoriesButtonRef.current?.getBoundingClientRect();
      const menuRect = categoriesMenuRef.current?.getBoundingClientRect();

      if (buttonRect && menuRect) {
        const mouseX = event.clientX;
        const mouseY = event.clientY;

        const isInButton =
          mouseX >= buttonRect.left &&
          mouseX <= buttonRect.right &&
          mouseY >= buttonRect.top &&
          mouseY <= buttonRect.bottom;

        const isInMenu =
          mouseX >= menuRect.left &&
          mouseX <= menuRect.right &&
          mouseY >= menuRect.top &&
          mouseY <= menuRect.bottom;

        // Create a bridge zone between button and menu
        const isInBridge =
          mouseX >= Math.min(buttonRect.left, menuRect.left) &&
          mouseX <= Math.max(buttonRect.right, menuRect.right) &&
          mouseY >= buttonRect.bottom &&
          mouseY <= menuRect.top + 5; // Allow 5px buffer

        // Only close if mouse is outside all areas (button, menu, and bridge)
        if (!isInButton && !isInMenu && !isInBridge) {
          setShowCategoriesMenu(false);
          setHoveredCategory(null);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    // Only add mousemove listener when menu is open to improve performance
    if (showCategoriesMenu) {
      document.addEventListener("mousemove", handleMouseLeave);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("mousemove", handleMouseLeave);
    };
  }, [showCategoriesMenu, isMobile]);

  const handleCategoryClick = (category: CategoryItem) => {
    if (category.id === "categories") {
      if (isMobile) {
        setShowMobileDrawer(true);
        setDrawerState("main");
      }
      return;
    }

    setActiveCategory(category.id); // Keep this active

    const searchParams = new URLSearchParams({ category: category.id });
    router.push(`/dynamicmarket?${searchParams.toString()}`);

    // Remove the setTimeout that resets activeCategory
  };

  const handleCategoriesMouseEnter = () => {
    if (!isMobile) {
      setShowCategoriesMenu(true);
    }
  };

  const handleCategoriesMouseLeave = () => {
    // Don't close immediately - let the menu handle closing
  };

  const handleMenuMouseEnter = () => {
    if (!isMobile) {
      setShowCategoriesMenu(true);
    }
  };

  const handleMenuMouseLeave = () => {
    if (!isMobile) {
      setShowCategoriesMenu(false);
      setHoveredCategory(null);
    }
  };

  const handleBuyerCategoryClick = (buyerCategory: BuyerCategory) => {
    if (isMobile) {
      setSelectedMainCategory(buyerCategory);
      setDrawerState("subcategory");
    } else {
      const path = `/category/${buyerCategory.key
        .toLowerCase()
        .replace(/\s+/g, "-")}`;
      router.push(path);
      setShowCategoriesMenu(false);
      setHoveredCategory(null);
    }
  };

  const handleSubcategoryClick = (
    buyerCategory: BuyerCategory,
    subcategory: string
  ) => {
    if (isMobile) {
      setSelectedSubcategory(subcategory);
      setDrawerState("subsubcategory");
    } else {
      const categoryPath = buyerCategory.key.toLowerCase().replace(/\s+/g, "-");
      const subcategoryPath = subcategory.toLowerCase().replace(/\s+/g, "-");
      const path = `/category/${categoryPath}/${subcategoryPath}`;
      router.push(path);
      setShowCategoriesMenu(false);
      setHoveredCategory(null);
    }
  };

  const handleSubSubcategoryClick = (subSubcategory: string) => {
    if (selectedMainCategory && selectedSubcategory) {
      const params = new URLSearchParams();

      if (
        selectedMainCategory.key === "Women" ||
        selectedMainCategory.key === "Men"
      ) {
        // ✅ FIX: Use the same logic as Flutter for Women/Men categories
        // Map buyer subcategory to actual product category
        const mapping = AllInOneCategoryData.getBuyerToProductMapping(
          selectedMainCategory.key,
          selectedSubcategory,
          subSubcategory
        );

        const productCategory = mapping?.category || "Clothing & Fashion";

        // Convert to URL-friendly format for the URL parameter
        const urlCategory =
          REVERSE_CATEGORY_MAPPING[productCategory] ||
          productCategory.toLowerCase().replace(/[&\s]+/g, "-");

        console.log("🔄 Women/Men navigation:", {
          buyerCategory: selectedMainCategory.key,
          buyerSubcategory: selectedSubcategory,
          subSubcategory,
          mappedProductCategory: productCategory,
          urlCategory,
        });

        params.set("category", urlCategory);
        params.set("subcategory", subSubcategory); // subSubcategory becomes the product subcategory
        params.set("buyerCategory", selectedMainCategory.key); // For gender filtering
        params.set("buyerSubcategory", selectedSubcategory); // For reference
      } else {
        // ✅ For other categories: Use standard mapping (same as Flutter)
        const urlCategory =
          REVERSE_CATEGORY_MAPPING[selectedMainCategory.key] ||
          selectedMainCategory.key.toLowerCase().replace(/\s+/g, "-");

        params.set("category", urlCategory);
        params.set("subcategory", selectedSubcategory);
        params.set("subsubcategory", subSubcategory);
        params.set("buyerCategory", selectedMainCategory.key);
        params.set("buyerSubcategory", selectedSubcategory);
      }

      params.set(
        "displayName",
        getLocalizedSubSubcategory(
          selectedMainCategory.key,
          selectedSubcategory,
          subSubcategory
        )
      );

      console.log("🔄 Final navigation params:", params.toString());
      router.push(`/dynamicmarket2?${params.toString()}`);
      closeMobileDrawer();
    }
  };

  const closeMobileDrawer = () => {
    setShowMobileDrawer(false);
    setDrawerState("main");
    setSelectedMainCategory(null);
    setSelectedSubcategory(null);
  };

  const goBackInDrawer = () => {
    if (drawerState === "subsubcategory") {
      setDrawerState("subcategory");
      setSelectedSubcategory(null);
    } else if (drawerState === "subcategory") {
      setDrawerState("main");
      setSelectedMainCategory(null);
    }
  };

  return (
    <>
      <div
        ref={headerRef}
        className={`
          relative w-full transition-all duration-300 ease-in-out
          ${
            isDark
              ? "bg-gray-900/95 border-gray-700/50"
              : "bg-white/95 border-gray-200/50"
          }
          backdrop-blur-xl border-b shadow-sm ${className}
        `}
      >
        <div className="h-14 px-4 overflow-x-auto">
          <div className="flex items-center justify-center h-full min-w-max">
            <div
              ref={categoriesContainerRef}
              className="flex items-center space-x-3 lg:space-x-4"
            >
              {categories.map((category) => {
                const IconComponent = category.icon;
                const isActive = activeCategory === category.id;

                if (category.id === "categories") {
                  return (
                    <div
                      key={category.id}
                      className="relative"
                      onMouseEnter={handleCategoriesMouseEnter}
                      onMouseLeave={handleCategoriesMouseLeave}
                    >
                      <button
                        ref={categoriesButtonRef}
                        onClick={() => handleCategoryClick(category)}
                        className={`
                          flex items-center justify-center gap-2 px-4 py-2 rounded-lg
                          transition-all duration-200 group min-w-max
                          ${
                            showCategoriesMenu && !isMobile
                              ? isDark
                                ? "bg-gray-700 text-white"
                                : "bg-gray-100 text-gray-900"
                              : isDark
                              ? "hover:bg-gray-800 text-gray-300 hover:text-white"
                              : "hover:bg-gray-50 text-gray-600 hover:text-gray-900"
                          }
                          active:scale-95
                        `}
                        aria-label={category.name}
                      >
                        <IconComponent
                          size={16}
                          className={`
                            transition-all duration-200
                            ${
                              showCategoriesMenu && !isMobile
                                ? "text-orange-500"
                                : "group-hover:text-orange-500"
                            }
                          `}
                        />
                        <span
                          className={`
                            text-xs font-medium transition-all duration-200
                            ${
                              showCategoriesMenu && !isMobile
                                ? isDark
                                  ? "text-white"
                                  : "text-gray-900"
                                : isDark
                                ? "text-gray-400 group-hover:text-gray-200"
                                : "text-gray-600 group-hover:text-gray-800"
                            }
                          `}
                        >
                          {category.name}
                        </span>
                      </button>
                    </div>
                  );
                }

                return (
                  <button
                    key={category.id}
                    onClick={() => handleCategoryClick(category)}
                    className={`
                      flex items-center justify-center gap-2 px-4 py-2 rounded-lg
                      transition-all duration-200 group min-w-max
                      ${
                        isActive
                          ? isDark
                            ? "bg-gray-700 text-white"
                            : "bg-gray-100 text-gray-900"
                          : isDark
                          ? "hover:bg-gray-800 text-gray-300 hover:text-white"
                          : "hover:bg-gray-50 text-gray-600 hover:text-gray-900"
                      }
                      active:scale-95
                    `}
                    aria-label={category.name}
                  >
                    <IconComponent
                      size={16}
                      className={`
                        transition-all duration-200
                        ${
                          isActive
                            ? "text-orange-500"
                            : "group-hover:text-orange-500"
                        }
                      `}
                    />
                    <span
                      className={`
                        text-xs font-medium transition-all duration-200
                        ${
                          isActive
                            ? isDark
                              ? "text-white"
                              : "text-gray-900"
                            : isDark
                            ? "text-gray-400 group-hover:text-gray-200"
                            : "text-gray-600 group-hover:text-gray-800"
                        }
                      `}
                    >
                      {category.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Categories Dropdown Menu */}
      {showCategoriesMenu && !isMobile && (
        <div
          ref={categoriesMenuRef}
          className={`
            fixed min-h-[400px] max-h-[600px] overflow-y-auto z-[9999]
            ${isDark ? "bg-gray-900" : "bg-white"}
            border-b border-l border-r 
            ${isDark ? "border-gray-700" : "border-gray-200"}
            shadow-2xl backdrop-blur-xl
            overflow-hidden rounded-b-lg
          `}
          style={{
            top: headerRef.current
              ? `${
                  headerRef.current.offsetTop +
                  headerRef.current.offsetHeight -
                  1
                }px`
              : "119px",
            left: categoriesContainerRef.current
              ? `${categoriesContainerRef.current.offsetLeft}px`
              : "0px",
            width: categoriesContainerRef.current
              ? `${categoriesContainerRef.current.offsetWidth}px`
              : "auto",
          }}
          onMouseEnter={handleMenuMouseEnter}
          onMouseLeave={handleMenuMouseLeave}
        >
          <div className="flex h-full">
            {/* Left side - Main categories */}
            <div
              className={`
              w-1/3 border-r ${isDark ? "border-gray-700" : "border-gray-200"}
              ${isDark ? "bg-gray-800/50" : "bg-gray-50"}
            `}
            >
              <div className="p-4">
                <h3
                  className={`
                  text-sm font-semibold mb-3
                  ${isDark ? "text-gray-200" : "text-gray-800"}
                `}
                >
                  TÜM KATEGORİLER
                </h3>
                <div className="space-y-1">
                  {buyerCategories.map((buyerCategory) => {
                    const CategoryIcon = buyerCategory.icon;
                    const isHovered = hoveredCategory === buyerCategory.key;

                    return (
                      <button
                        key={buyerCategory.key}
                        onClick={() => handleBuyerCategoryClick(buyerCategory)}
                        onMouseEnter={() =>
                          setHoveredCategory(buyerCategory.key)
                        }
                        className={`
                          w-full flex items-center space-x-3 p-3 rounded-lg
                          transition-all duration-200 text-left
                          ${
                            isHovered
                              ? isDark
                                ? "bg-gray-700 text-white"
                                : "bg-white text-gray-900 shadow-sm"
                              : isDark
                              ? "hover:bg-gray-700 text-gray-300"
                              : "hover:bg-white text-gray-700 hover:shadow-sm"
                          }
                        `}
                      >
                        <CategoryIcon
                          size={18}
                          className={`
                            transition-colors duration-200
                            ${isHovered ? "text-orange-500" : "text-current"}
                          `}
                        />
                        <span className="text-sm font-medium flex-1">
                          {buyerCategory.name}
                        </span>
                        <ChevronRight
                          size={14}
                          className={`
                            transition-colors duration-200
                            ${isDark ? "text-gray-500" : "text-gray-400"}
                          `}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right side - Subcategories */}
            <div className="w-2/3 p-4">
              {hoveredCategory && (
                <div>
                  {(() => {
                    const category = buyerCategories.find(
                      (cat) => cat.key === hoveredCategory
                    );
                    if (!category) return null;

                    // Chunk subcategories into groups of 3
                    const subcategoryChunks = chunkArray(
                      category.subcategories,
                      3
                    );

                    return (
                      <div>
                        <h4
                          className={`
                          text-lg font-semibold mb-4 flex items-center space-x-2
                          ${isDark ? "text-gray-200" : "text-gray-800"}
                        `}
                        >
                          <category.icon
                            size={20}
                            className="text-orange-500"
                          />
                          <span>{category.name}</span>
                        </h4>

                        <div className="space-y-6">
                          {subcategoryChunks.map((chunk, chunkIndex) => (
                            <div
                              key={chunkIndex}
                              className="grid grid-cols-3 gap-6"
                            >
                              {chunk.map((subcategory) => (
                                <div key={subcategory} className="space-y-2">
                                  <button
                                    onClick={() =>
                                      handleSubcategoryClick(
                                        category,
                                        subcategory
                                      )
                                    }
                                    className={`
                                      text-sm font-medium hover:text-orange-500 
                                      transition-colors duration-200 text-left block
                                      ${
                                        isDark
                                          ? "text-blue-400 hover:text-orange-400"
                                          : "text-blue-600"
                                      }
                                    `}
                                  >
                                    {getLocalizedSubcategory(
                                      category.key,
                                      subcategory
                                    )}
                                  </button>

                                  {/* Sub-subcategories */}
                                  <div className="space-y-1">
                                    {AllInOneCategoryData.kBuyerSubSubcategories[
                                      category.key
                                    ]?.[subcategory]
                                      ?.slice(0, 6)
                                      .map((subSubcategory) => (
                                        <button
                                          key={subSubcategory}
                                          onClick={() => {
                                            const params =
                                              new URLSearchParams();

                                            if (
                                              category.key === "Women" ||
                                              category.key === "Men"
                                            ) {
                                              // ✅ FIX: Use the same logic as handleSubSubcategoryClick
                                              const productCategoryMapping =
                                                AllInOneCategoryData.getBuyerToProductMapping(
                                                  category.key,
                                                  subcategory,
                                                  subSubcategory
                                                );

                                              const productCategory =
                                                productCategoryMapping?.category ||
                                                "Clothing & Fashion";

                                              // Convert to URL-friendly format
                                              const urlCategory =
                                                REVERSE_CATEGORY_MAPPING[
                                                  productCategory
                                                ] ||
                                                productCategory
                                                  .toLowerCase()
                                                  .replace(/[&\s]+/g, "-");

                                              params.set(
                                                "category",
                                                urlCategory
                                              );
                                              params.set(
                                                "subcategory",
                                                subSubcategory
                                              );
                                              params.set(
                                                "buyerCategory",
                                                category.key
                                              );
                                              params.set(
                                                "buyerSubcategory",
                                                subcategory
                                              );
                                            } else {
                                              // For other categories: Use standard mapping
                                              const urlCategory =
                                                REVERSE_CATEGORY_MAPPING[
                                                  category.key
                                                ] ||
                                                category.key
                                                  .toLowerCase()
                                                  .replace(/\s+/g, "-");

                                              params.set(
                                                "category",
                                                urlCategory
                                              );
                                              params.set(
                                                "subcategory",
                                                subcategory
                                              );
                                              params.set(
                                                "subsubcategory",
                                                subSubcategory
                                              );
                                              params.set(
                                                "buyerCategory",
                                                category.key
                                              );
                                              params.set(
                                                "buyerSubcategory",
                                                subcategory
                                              );
                                            }

                                            params.set(
                                              "displayName",
                                              getLocalizedSubSubcategory(
                                                category.key,
                                                subcategory,
                                                subSubcategory
                                              )
                                            );

                                            router.push(
                                              `/dynamicmarket2?${params.toString()}`
                                            );
                                            setShowCategoriesMenu(false);
                                            setHoveredCategory(null);
                                          }}
                                          className={`
                                          block text-xs py-1 hover:text-orange-500 
                                          transition-colors duration-200 text-left
                                          ${
                                            isDark
                                              ? "text-gray-400 hover:text-orange-400"
                                              : "text-gray-600"
                                          }
                                        `}
                                        >
                                          {getLocalizedSubSubcategory(
                                            category.key,
                                            subcategory,
                                            subSubcategory
                                          )}
                                        </button>
                                      ))}
                                    {(AllInOneCategoryData
                                      .kBuyerSubSubcategories[category.key]?.[
                                      subcategory
                                    ]?.length || 0) > 6 && (
                                      <button
                                        onClick={() =>
                                          handleSubcategoryClick(
                                            category,
                                            subcategory
                                          )
                                        }
                                        className={`
                                          block text-xs py-1 font-medium
                                          transition-colors duration-200 text-left
                                          ${
                                            isDark
                                              ? "text-orange-400 hover:text-orange-300"
                                              : "text-orange-600 hover:text-orange-700"
                                          }
                                        `}
                                      >
                                        Tümünü Gör →
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {!hoveredCategory && (
                <div
                  className={`
                  flex items-center justify-center h-full
                  ${isDark ? "text-gray-500" : "text-gray-400"}
                `}
                >
                  <div className="text-center">
                    <Grid3x3 size={48} className="mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Bir kategori seçin</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Drawer */}
      {isMobile && (
        <>
          {/* ✅ Fix 2: Backdrop with no background color */}
          <div
            className={`
              fixed inset-0 z-[9998] transition-opacity duration-300 ease-in-out
              ${showMobileDrawer ? 'opacity-100' : 'opacity-0 pointer-events-none'}
            `}
            onClick={closeMobileDrawer}
          />

          {/* ✅ Fix 1: Drawer with smooth slide animation */}
          <div
            className={`
              fixed top-0 left-0 h-full w-80 max-w-[85vw] z-[9999]
              ${isDark ? "bg-gray-900" : "bg-white"}
              shadow-2xl transform transition-transform duration-300 ease-in-out
              ${showMobileDrawer ? "translate-x-0" : "-translate-x-full"}
              overflow-y-auto
            `}
          >
            {/* Header */}
            <div
              className={`
                flex items-center justify-between p-4 border-b
                ${isDark ? "border-gray-700" : "border-gray-200"}
              `}
            >
              <div className="flex items-center space-x-3">
                {drawerState !== "main" && (
                  <button
                    onClick={goBackInDrawer}
                    className={`
                      p-2 rounded-lg transition-colors duration-200
                      ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"}
                    `}
                  >
                    <ChevronLeft
                      size={20}
                      className={isDark ? "text-gray-300" : "text-gray-600"}
                    />
                  </button>
                )}
                <h2
                  className={`
                    text-lg font-semibold
                    ${isDark ? "text-gray-200" : "text-gray-800"}
                  `}
                >
                  {drawerState === "main" && "Kategoriler"}
                  {drawerState === "subcategory" && selectedMainCategory?.name}
                  {drawerState === "subsubcategory" &&
                    selectedSubcategory &&
                    getLocalizedSubcategory(
                      selectedMainCategory?.key || "",
                      selectedSubcategory
                    )}
                </h2>
              </div>
              <button
                onClick={closeMobileDrawer}
                className={`
                  p-2 rounded-lg transition-colors duration-200
                  ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"}
                `}
              >
                <X
                  size={20}
                  className={isDark ? "text-gray-300" : "text-gray-600"}
                />
              </button>
            </div>

            {/* Content */}
            <div className="p-4">
              {drawerState === "main" && (
                <div className="space-y-2">
                  {buyerCategories.map((buyerCategory) => {
                    const CategoryIcon = buyerCategory.icon;

                    return (
                      <button
                        key={buyerCategory.key}
                        onClick={() => handleBuyerCategoryClick(buyerCategory)}
                        className={`
                          w-full flex items-center space-x-3 p-3 rounded-lg
                          transition-all duration-200 text-left
                          ${
                            isDark
                              ? "hover:bg-gray-800 text-gray-300 hover:text-white"
                              : "hover:bg-gray-50 text-gray-700 hover:text-gray-900"
                          }
                        `}
                      >
                        <CategoryIcon size={20} className="text-orange-500" />
                        <span className="text-sm font-medium flex-1">
                          {buyerCategory.name}
                        </span>
                        <ChevronRight
                          size={16}
                          className={isDark ? "text-gray-500" : "text-gray-400"}
                        />
                      </button>
                    );
                  })}
                </div>
              )}

              {drawerState === "subcategory" && selectedMainCategory && (
                <div className="space-y-2">
                  {/* View All Category Button */}
                  <button
                    onClick={() => {
                      const path = `/category/${selectedMainCategory.key
                        .toLowerCase()
                        .replace(/\s+/g, "-")}`;
                      router.push(path);
                      closeMobileDrawer();
                    }}
                    className={`
                      w-full flex items-center space-x-3 p-3 rounded-lg mb-4
                      transition-all duration-200 text-left border
                      ${
                        isDark
                          ? "border-orange-500 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20"
                          : "border-orange-500 bg-orange-50 text-orange-600 hover:bg-orange-100"
                      }
                    `}
                  >
                    <selectedMainCategory.icon
                      size={20}
                      className="text-orange-500"
                    />
                    <span className="text-sm font-medium flex-1">
                      Tüm {selectedMainCategory.name}
                    </span>
                  </button>

                  {selectedMainCategory.subcategories.map((subcategory) => (
                    <button
                      key={subcategory}
                      onClick={() =>
                        handleSubcategoryClick(
                          selectedMainCategory,
                          subcategory
                        )
                      }
                      className={`
                        w-full flex items-center space-x-3 p-3 rounded-lg
                        transition-all duration-200 text-left
                        ${
                          isDark
                            ? "hover:bg-gray-800 text-gray-300 hover:text-white"
                            : "hover:bg-gray-50 text-gray-700 hover:text-gray-900"
                        }
                      `}
                    >
                      <span className="text-sm font-medium flex-1">
                        {getLocalizedSubcategory(
                          selectedMainCategory.key,
                          subcategory
                        )}
                      </span>
                      <ChevronRight
                        size={16}
                        className={isDark ? "text-gray-500" : "text-gray-400"}
                      />
                    </button>
                  ))}
                </div>
              )}

              {drawerState === "subsubcategory" &&
                selectedMainCategory &&
                selectedSubcategory && (
                  <div className="space-y-2">
                    {/* View All Subcategory Button */}
                    <button
                      onClick={() => {
                        const categoryPath = selectedMainCategory.key
                          .toLowerCase()
                          .replace(/\s+/g, "-");
                        const subcategoryPath = selectedSubcategory
                          .toLowerCase()
                          .replace(/\s+/g, "-");
                        const path = `/category/${categoryPath}/${subcategoryPath}`;
                        router.push(path);
                        closeMobileDrawer();
                      }}
                      className={`
                      w-full flex items-center space-x-3 p-3 rounded-lg mb-4
                      transition-all duration-200 text-left border
                      ${
                        isDark
                          ? "border-orange-500 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20"
                          : "border-orange-500 bg-orange-50 text-orange-600 hover:bg-orange-100"
                      }
                    `}
                    >
                      <span className="text-sm font-medium flex-1">
                        Tüm{" "}
                        {getLocalizedSubcategory(
                          selectedMainCategory.key,
                          selectedSubcategory
                        )}
                      </span>
                    </button>

                    {AllInOneCategoryData.kBuyerSubSubcategories[
                      selectedMainCategory.key
                    ]?.[selectedSubcategory]?.map((subSubcategory) => (
                      <button
                        key={subSubcategory}
                        onClick={() =>
                          handleSubSubcategoryClick(subSubcategory)
                        }
                        className={`
                        w-full flex items-center space-x-3 p-3 rounded-lg
                        transition-all duration-200 text-left
                        ${
                          isDark
                            ? "hover:bg-gray-800 text-gray-300 hover:text-white"
                            : "hover:bg-gray-50 text-gray-700 hover:text-gray-900"
                        }
                      `}
                      >
                        <span className="text-sm font-medium flex-1">
                          {getLocalizedSubSubcategory(
                            selectedMainCategory.key,
                            selectedSubcategory,
                            subSubcategory
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
            </div>
          </div>
        </>
      )}
    </>
  );
}