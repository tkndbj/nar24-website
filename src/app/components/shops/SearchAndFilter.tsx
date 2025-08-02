import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

interface SearchAndFilterProps {
  onSearch: (term: string) => void;
  onCategoryFilter: (category: string | null) => void;
  selectedCategory: string | null;
  isDarkMode: boolean;
}

const CATEGORIES = [
  "Women",
  "Men",
  "Kids",
  "Electronics",
  "Home & Garden",
  "Sports",
  "Beauty",
  "Books",
  "Automotive",
  "Jewelry",
];

export default function SearchAndFilter({
  onSearch,
  onCategoryFilter,
  selectedCategory,
  isDarkMode,
}: SearchAndFilterProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const t = useTranslations("shops");

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, onSearch]);

  const handleCategorySelect = (category: string) => {
    if (selectedCategory === category) {
      onCategoryFilter(null);
    } else {
      onCategoryFilter(category);
    }
    setIsFilterExpanded(false);
  };

  const clearFilters = () => {
    setSearchTerm("");
    onCategoryFilter(null);
    setIsFilterExpanded(false);
  };

  const hasActiveFilters = searchTerm.trim() || selectedCategory;

  return (
    <div className="mb-8 space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <MagnifyingGlassIcon
            className={`h-5 w-5 ${
              isDarkMode ? "text-gray-400" : "text-gray-500"
            }`}
          />
        </div>
        <input
          type="text"
          placeholder={t("searchShops")}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={`w-full pl-10 pr-4 py-3 rounded-lg border transition-colors duration-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            isDarkMode
              ? "bg-gray-800 border-gray-700 text-white placeholder-gray-400"
              : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
          }`}
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
          >
            <XMarkIcon
              className={`h-5 w-5 ${
                isDarkMode
                  ? "text-gray-400 hover:text-gray-300"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            />
          </button>
        )}
      </div>

      {/* Filter Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setIsFilterExpanded(!isFilterExpanded)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors duration-200 ${
            isDarkMode
              ? "bg-gray-800 border-gray-700 text-white hover:bg-gray-700"
              : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
          } ${selectedCategory ? "ring-2 ring-blue-500" : ""}`}
        >
          <FunnelIcon className="w-5 h-5" />
          {t("filter")}
          {selectedCategory && (
            <span className="ml-1 px-2 py-0.5 text-xs bg-blue-600 text-white rounded-full">
              1
            </span>
          )}
        </button>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className={`text-sm px-3 py-2 rounded-lg transition-colors duration-200 ${
              isDarkMode
                ? "text-gray-400 hover:text-white hover:bg-gray-800"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            {t("clearFilters")}
          </button>
        )}
      </div>

      {/* Filter Panel */}
      {isFilterExpanded && (
        <div
          className={`p-4 rounded-lg border transition-all duration-200 ${
            isDarkMode
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-300"
          }`}
        >
          <h3
            className={`font-semibold mb-3 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("categories")}
          </h3>

          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                onClick={() => handleCategorySelect(category)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                  selectedCategory === category
                    ? "bg-blue-600 text-white"
                    : isDarkMode
                    ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {searchTerm && (
            <div
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm ${
                isDarkMode
                  ? "bg-blue-900/50 text-blue-300"
                  : "bg-blue-100 text-blue-800"
              }`}
            >
              <span>&quot;{searchTerm}&quot;</span>
              <button
                onClick={() => setSearchTerm("")}
                className="ml-1 hover:opacity-70"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          )}

          {selectedCategory && (
            <div
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm ${
                isDarkMode
                  ? "bg-green-900/50 text-green-300"
                  : "bg-green-100 text-green-800"
              }`}
            >
              <span>{selectedCategory}</span>
              <button
                onClick={() => onCategoryFilter(null)}
                className="ml-1 hover:opacity-70"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
